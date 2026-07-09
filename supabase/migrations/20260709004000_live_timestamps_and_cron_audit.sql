alter table public.trucks
  add column if not exists last_live_updated_at timestamptz,
  add column if not exists live_started_at timestamptz,
  add column if not exists live_expires_at timestamptz,
  add column if not exists live_source text;

update public.trucks
set
  last_live_updated_at = coalesce(last_live_updated_at, updated_at, now()),
  live_started_at = coalesce(live_started_at, updated_at, now()),
  live_expires_at = coalesce(live_expires_at, coalesce(last_live_updated_at, updated_at, now()) + interval '12 hours'),
  live_source = coalesce(live_source, 'legacy_backfill')
where is_open is true
  and (
    last_live_updated_at is null
    or live_started_at is null
    or live_expires_at is null
  );

create or replace function public.close_stale_open_trucks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_window interval := interval '12 hours';
  closed_count integer := 0;
begin
  /*
    Trust rule:
    stale LIVE status resolves Closed, not Open.

    LIVE freshness is tracked on public.trucks LIVE-specific fields. General
    truck edits update public.trucks.updated_at, so updated_at is intentionally
    not used as the stale LIVE signal.
  */
  with closed as (
    update public.trucks t
    set
      is_open = false,
      live_expires_at = null,
      live_source = 'expiration',
      updated_at = now()
    where t.is_open is true
      and (
        t.live_expires_at < now()
        or (
          t.live_expires_at is null
          and t.last_live_updated_at < now() - stale_window
        )
      )
    returning t.id
  ),
  audit as (
    insert into public.truck_live_events (
      truck_id,
      action,
      source,
      actor_user_id,
      location_label,
      metadata
    )
    select
      c.id,
      'go_offline',
      'expiration',
      null,
      l.label,
      jsonb_build_object(
        'closed_by', 'close_stale_open_trucks',
        'stale_window_hours', 12
      )
    from closed c
    left join lateral (
      select label
      from public.locations
      where truck_id::text = c.id::text
      limit 1
    ) l on true
    returning 1
  )
    -- Count the audit rows so the insert remains an explicit part of the function result.
    select count(*) into closed_count
    from audit;

  return closed_count;
end;
$$;

comment on function public.close_stale_open_trucks() is
'Closes stale open trucks using public.trucks.live_expires_at with last_live_updated_at legacy fallback, and writes expiration audit events.';

comment on column public.trucks.last_live_updated_at is
'Last confirmed LIVE freshness timestamp. General profile/content edits must not update this field.';

comment on column public.trucks.live_started_at is
'Timestamp when the current or most recent LIVE session started.';

comment on column public.trucks.live_expires_at is
'Timestamp when the current LIVE session should expire automatically.';

comment on column public.trucks.live_source is
'Source of the latest LIVE status change, such as manual, expiration, archive, schedule, or nudge_confirmation.';
