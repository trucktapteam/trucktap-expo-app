-- Reconstructed verbatim from production supabase_migrations.schema_migrations
-- (version 20260815044446). Already applied to production; history-alignment only.
-- NOTE: this version was NOT in the list production reported as missing, but it
-- is also absent from the local repo. Included here for completeness.

CREATE OR REPLACE FUNCTION public.close_stale_open_trucks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_candidate record;
  v_changed boolean;
  v_closed_count integer := 0;
  v_error_state text;
  v_error_message text;
  v_settings private.hands_free_live_settings;
  v_stale_fallback_window interval;
begin
  select s.* into v_settings
  from private.hands_free_live_settings s
  where s.singleton is true;

  -- Mirrors the manual-session fallback duration used in
  -- transition_truck_live, so the two never disagree. Inert (stays 12h)
  -- while early_adopt_enabled is false.
  v_stale_fallback_window := case
    when v_settings.early_adopt_enabled is true then interval '6 hours'
    else interval '12 hours'
  end;

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
            or t.last_live_updated_at < statement_timestamp() - v_stale_fallback_window
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
          'stale_window_hours', extract(epoch from v_stale_fallback_window) / 3600
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
            E'[\\r\\n\\t]+',
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
$function$;
