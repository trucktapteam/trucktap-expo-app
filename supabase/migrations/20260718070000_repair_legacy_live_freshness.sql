-- Repair pre-Trust-Engine LIVE rows that have no freshness or expiry.
--
-- This migration intentionally identifies rows by lifecycle state, never by
-- truck identity. It gives each legacy session a defensible, bounded lifetime
-- and then delegates any resulting stale close to the canonical transition so
-- the normal compare-and-set and audit guarantees remain intact.

create or replace function public.close_stale_open_trucks()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate record;
  v_changed boolean;
  v_closed_count integer := 0;
  v_error_state text;
  v_error_message text;
begin
  -- Expiry is authoritative. A missing expiry falls back to LIVE freshness;
  -- missing expiry and freshness is malformed and therefore closed-safe.
  -- Expected live_started_at prevents this scan from closing a session that
  -- an owner restarted before the canonical transition acquired its row lock.
  for v_candidate in
    select
      t.id,
      t.live_started_at
    from public.trucks t
    where t.is_open is true
      and (
        t.live_expires_at < statement_timestamp()
        or (
          t.live_expires_at is null
          and (
            t.last_live_updated_at is null
            or t.last_live_updated_at < statement_timestamp() - interval '12 hours'
          )
        )
      )
  loop
    begin
      select r.changed
      into v_changed
      from private.transition_truck_live(
        'go_offline',
        v_candidate.id,
        'expiration',
        null,
        null,
        null,
        null,
        null,
        null,
        jsonb_build_object(
          'closed_by', 'close_stale_open_trucks',
          'stale_window_hours', 12
        ),
        v_candidate.live_started_at,
        true
      ) r;

      if v_changed then
        v_closed_count := v_closed_count + 1;
      end if;
    exception
      when others then
        -- Isolate each candidate in a subtransaction. A failed transition
        -- remains unchanged and receives no false go_offline event.
        get stacked diagnostics
          v_error_state = returned_sqlstate,
          v_error_message = message_text;

        v_error_message := left(
          regexp_replace(
            coalesce(v_error_message, 'unknown transition failure'),
            E'[\r\n\t]+',
            ' ',
            'g'
          ),
          500
        );

        raise warning using message = format(
          'close_stale_open_trucks candidate failed: truck_id=%s sqlstate=%s message=%s',
          v_candidate.id,
          coalesce(v_error_state, 'unknown'),
          v_error_message
        );
    end;
  end loop;

  return v_closed_count;
end;
$$;

comment on function public.close_stale_open_trucks() is
'Closes stale LIVE sessions through the private canonical transition. Missing expiry and LIVE freshness is malformed and closed-safe. A live_started_at compare-and-set prevents closing a newer owner session; per-truck exception isolation preserves other successful closes.';

revoke all on function public.close_stale_open_trucks() from public;
revoke all on function public.close_stale_open_trucks() from anon;
revoke all on function public.close_stale_open_trucks() from authenticated;
grant execute on function public.close_stale_open_trucks() to service_role;

do $$
declare
  v_now timestamptz := statement_timestamp();
begin
  -- The Phase 1A guard permits lifecycle writes only from the canonical
  -- transition owner with this transaction-local marker. This is a one-time
  -- data repair, not a public transition or a reusable bypass.
  perform set_config('trucktap.canonical_live_transition', 'on', true);

  with legacy_candidates as (
    select
      t.id,
      least(
        coalesce(
          greatest(
            t.live_started_at,
            last_go_live.created_at,
            t.updated_at
          ),
          v_now
        ),
        v_now
      ) as freshness_at
    from public.trucks t
    left join lateral (
      select max(e.created_at) as created_at
      from public.truck_live_events e
      where e.truck_id = t.id
        and e.action = 'go_live'
    ) last_go_live on true
    where t.is_open is true
      and t.last_live_updated_at is null
      and t.live_expires_at is null
  )
  update public.trucks t
  set
    last_live_updated_at = c.freshness_at,
    live_started_at = c.freshness_at,
    live_expires_at = c.freshness_at + interval '12 hours',
    live_source = 'legacy_backfill'
  from legacy_candidates c
  where t.id = c.id;
end;
$$;

-- Rows whose best defensible freshness is already outside the bounded window
-- close here through private.transition_truck_live(), including audit history.
-- Fresher legacy sessions remain open only until their new finite expiry.
select public.close_stale_open_trucks();
