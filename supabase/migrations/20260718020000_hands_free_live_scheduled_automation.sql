-- Hands-Free LIVE scheduled automation
--
-- This layer consumes the Phase 1A ownership primitives. It never writes
-- trucks LIVE fields or canonical locations directly.

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.upcoming_stops
  add column if not exists auto_start_first_attempt_at timestamptz null,
  add column if not exists auto_start_retry_count integer not null default 0,
  add column if not exists auto_start_outcome text null,
  add column if not exists auto_end_outcome text null;

alter table public.upcoming_stops
  drop constraint if exists upcoming_stops_auto_start_retry_count_check;

alter table public.upcoming_stops
  add constraint upcoming_stops_auto_start_retry_count_check
  check (auto_start_retry_count >= 0);

comment on column public.upcoming_stops.auto_start_first_attempt_at is
'Internal scheduler marker used to bound already-live rechecks. Not client-readable or client-writable.';

comment on column public.upcoming_stops.auto_start_retry_count is
'Internal count of bounded scheduled-start rechecks. Not client-readable or client-writable.';

comment on column public.upcoming_stops.auto_start_outcome is
'Internal structured start outcome. Owners receive a safe label through a controlled RPC; public clients cannot read it.';

comment on column public.upcoming_stops.auto_end_outcome is
'Internal structured end outcome. Owners receive a safe label through a controlled RPC; public clients cannot read it.';

create table if not exists private.hands_free_live_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  start_grace interval not null default interval '15 minutes'
    check (start_grace >= interval '0 seconds' and start_grace <= interval '2 hours'),
  end_grace interval not null default interval '5 minutes'
    check (end_grace >= interval '0 seconds' and end_grace <= interval '2 hours'),
  start_retry_window interval not null default interval '2 minutes'
    check (start_retry_window >= interval '0 seconds' and start_retry_window <= interval '15 minutes'),
  max_start_retries integer not null default 3
    check (max_start_retries between 0 and 20),
  batch_size integer not null default 100
    check (batch_size between 1 and 1000),
  updated_at timestamptz not null default now()
);

insert into private.hands_free_live_settings (singleton)
values (true)
on conflict (singleton) do nothing;

revoke all on table private.hands_free_live_settings
from public, anon, authenticated, service_role;

comment on table private.hands_free_live_settings is
'Operator-owned Hands-Free LIVE kill switch and bounded processor timing. The migration installs disabled.';

create table if not exists private.hands_free_live_processor_attempts (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  stop_id uuid null,
  truck_id uuid null,
  phase text not null check (phase in ('start', 'end', 'run')),
  outcome text not null,
  reason text null,
  sqlstate text null,
  error_message text null,
  attempted_at timestamptz not null default now()
);

create index if not exists hands_free_live_processor_attempts_run_idx
  on private.hands_free_live_processor_attempts (run_id, attempted_at);

create index if not exists hands_free_live_processor_attempts_stop_idx
  on private.hands_free_live_processor_attempts (stop_id, attempted_at desc);

revoke all on table private.hands_free_live_processor_attempts
from public, anon, authenticated, service_role;

revoke all on sequence private.hands_free_live_processor_attempts_id_seq
from public, anon, authenticated, service_role;

comment on table private.hands_free_live_processor_attempts is
'Private operational diagnostics. Successful LIVE transitions remain audited in truck_live_events with source=schedule.';

alter table public.profiles
  add column if not exists notify_hands_free_live_confirmations boolean not null default true;

comment on column public.profiles.notify_hands_free_live_confirmations is
'Owner opt-in for best-effort confirmations after successful scheduled Go LIVE and Go Offline transitions.';

create table if not exists public.hands_free_live_notification_deliveries (
  event_id uuid primary key references public.truck_live_events(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempt_count integer not null default 1,
  claimed_at timestamptz not null default now(),
  finished_at timestamptz null,
  attempted_devices integer not null default 0,
  failure_count integer not null default 0,
  error text null
);

alter table public.hands_free_live_notification_deliveries
  add column if not exists attempt_count integer not null default 1;

alter table public.hands_free_live_notification_deliveries
  drop constraint if exists hands_free_live_notification_attempt_count_check;

alter table public.hands_free_live_notification_deliveries
  add constraint hands_free_live_notification_attempt_count_check
  check (attempt_count > 0);

create index if not exists hands_free_live_notification_processing_idx
  on public.hands_free_live_notification_deliveries (claimed_at)
  where status = 'processing';

alter table public.hands_free_live_notification_deliveries enable row level security;
revoke all on table public.hands_free_live_notification_deliveries
from public, anon, authenticated;
grant select, insert, update on table public.hands_free_live_notification_deliveries
to service_role;

-- LIVE audit rows are canonical server output. Current clients use the
-- canonical owner RPCs and have no legitimate direct-insert path.
revoke insert on table public.truck_live_events from authenticated;

comment on table public.hands_free_live_notification_deliveries is
'Service-only at-most-once claims for optional owner confirmation pushes. It is not a LIVE transition audit.';

create or replace function public.claim_hands_free_live_notification_delivery(
  p_event_id uuid
)
returns table (
  claimed boolean,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_event_id is null then
    raise exception 'Notification event ID is required'
      using errcode = '22023';
  end if;

  return query
  insert into public.hands_free_live_notification_deliveries as delivery (
    event_id,
    status,
    attempt_count,
    claimed_at
  ) values (
    p_event_id,
    'processing',
    1,
    statement_timestamp()
  )
  on conflict (event_id) do update
  set
    status = 'processing',
    attempt_count = delivery.attempt_count + 1,
    claimed_at = statement_timestamp(),
    finished_at = null,
    attempted_devices = 0,
    failure_count = 0,
    error = null
  where delivery.status = 'failed'
  returning true, delivery.attempt_count;

  if not found then
    return query
    select
      false,
      d.attempt_count
    from public.hands_free_live_notification_deliveries d
    where d.event_id = p_event_id;
  end if;
end;
$$;

revoke all on function public.claim_hands_free_live_notification_delivery(uuid)
from public, anon, authenticated;
grant execute on function public.claim_hands_free_live_notification_delivery(uuid)
to service_role;

create or replace function private.reconcile_hands_free_live_notification_deliveries(
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reconciled integer;
begin
  if p_now is null then
    raise exception 'Reconciliation timestamp is required'
      using errcode = '22023';
  end if;

  update public.hands_free_live_notification_deliveries d
  set
    status = 'failed',
    finished_at = p_now,
    failure_count = greatest(d.failure_count, 1),
    error = 'Processing timeout after 2 minutes'
  where d.status = 'processing'
    and d.claimed_at < p_now - interval '2 minutes';

  get diagnostics v_reconciled = row_count;
  return v_reconciled;
end;
$$;

revoke all on function private.reconcile_hands_free_live_notification_deliveries(timestamptz)
from public, anon, authenticated, service_role;

create or replace function public.reconcile_hands_free_live_notification_deliveries()
returns integer
language sql
security definer
set search_path = pg_catalog
as $$
  select private.reconcile_hands_free_live_notification_deliveries(
    statement_timestamp()
  );
$$;

revoke all on function public.reconcile_hands_free_live_notification_deliveries()
from public, anon, authenticated;
grant execute on function public.reconcile_hands_free_live_notification_deliveries()
to service_role;

create or replace function public.get_hands_free_live_owner_settings(
  p_truck_id uuid
)
returns table (
  system_enabled boolean,
  start_grace_minutes integer,
  end_grace_minutes integer,
  confirmation_notifications_enabled boolean
)
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select t.owner_id
  into v_owner_id
  from public.trucks t
  where t.id = p_truck_id;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  if v_owner_id is distinct from auth.uid()
    and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  then
    raise exception 'Not authorized to read Hands-Free LIVE settings for truck %', p_truck_id
      using errcode = '42501';
  end if;

  return query
  select
    s.enabled,
    (extract(epoch from s.start_grace) / 60)::integer,
    (extract(epoch from s.end_grace) / 60)::integer,
    coalesce(p.notify_hands_free_live_confirmations, true)
  from private.hands_free_live_settings s
  left join public.profiles p on p.id = v_owner_id
  where s.singleton is true;
end;
$$;

revoke all on function public.get_hands_free_live_owner_settings(uuid)
from public, anon;
grant execute on function public.get_hands_free_live_owner_settings(uuid)
to authenticated;

create or replace function public.get_upcoming_stop_automation_statuses(
  p_truck_id uuid
)
returns table (
  stop_id uuid,
  enabled boolean,
  status_code text,
  status_label text,
  status_detail text,
  auto_start_resolved_at timestamptz,
  auto_live_started_at timestamptz,
  auto_end_resolved_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
declare
  v_owner_id uuid;
  v_system_enabled boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select t.owner_id
  into v_owner_id
  from public.trucks t
  where t.id = p_truck_id;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  if v_owner_id is distinct from auth.uid()
    and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  then
    raise exception 'Not authorized to read automation status for truck %', p_truck_id
      using errcode = '42501';
  end if;

  select s.enabled
  into v_system_enabled
  from private.hands_free_live_settings s
  where s.singleton is true;

  return query
  select
    s.id,
    s.auto_manage_live,
    case
      when s.auto_manage_live is not true then 'off'
      when s.automation_cancelled_at is not null then 'cancelled'
      when s.auto_end_resolved_at is not null
        and s.auto_end_outcome = 'went_offline' then 'automatically_stopped'
      when s.auto_end_resolved_at is not null then 'end_resolved_noop'
      when s.auto_live_started_at is not null
        and t.is_open is true
        and t.live_stop_id = s.id then 'automatically_live'
      when s.auto_live_started_at is not null
        and t.is_open is true
        and t.live_stop_id is distinct from s.id then 'manual_session_active'
      when s.auto_live_started_at is not null
        and t.is_open is not true then 'automatic_session_ended_early'
      when v_system_enabled is not true then 'system_paused'
      when s.auto_start_resolved_at is null
        and s.auto_start_outcome = 'retrying_previous_stop' then 'waiting_for_previous_stop'
      when s.auto_start_resolved_at is null
        and s.auto_start_outcome = 'retrying_manual_live' then 'waiting_for_manual_live'
      when s.auto_start_resolved_at is null then 'ready'
      when s.auto_start_outcome = 'blocked_manual_live' then 'blocked_manual_live'
      when s.auto_start_outcome = 'blocked_overlap' then 'blocked_overlap'
      when s.auto_start_outcome = 'missed_start_window' then 'missed_start_window'
      when s.auto_start_outcome in ('went_live', 'already_owned') then 'automatic_start_ended'
      else 'resolved'
    end,
    case
      when s.auto_manage_live is not true then 'Off'
      when s.automation_cancelled_at is not null then 'Cancelled'
      when s.auto_end_resolved_at is not null
        and s.auto_end_outcome = 'went_offline' then 'Automatically stopped serving'
      when s.auto_end_resolved_at is not null then 'Stop Serving already handled'
      when s.auto_live_started_at is not null
        and t.is_open is true
        and t.live_stop_id = s.id then 'Automatically went LIVE'
      when s.auto_live_started_at is not null
        and t.is_open is true
        and t.live_stop_id is distinct from s.id then 'Manual LIVE session now active'
      when s.auto_live_started_at is not null
        and t.is_open is not true then 'Automatic LIVE session ended early'
      when v_system_enabled is not true then 'Automation paused'
      when s.auto_start_resolved_at is null
        and s.auto_start_outcome = 'retrying_previous_stop' then 'Waiting for previous stop'
      when s.auto_start_resolved_at is null
        and s.auto_start_outcome = 'retrying_manual_live' then 'Waiting for manual LIVE session'
      when s.auto_start_resolved_at is null then 'Ready'
      when s.auto_start_outcome = 'blocked_manual_live' then 'Blocked because already LIVE manually'
      when s.auto_start_outcome = 'blocked_overlap' then 'Blocked by another scheduled stop'
      when s.auto_start_outcome = 'missed_start_window' then 'Start window was missed'
      when s.auto_start_outcome in ('went_live', 'already_owned') then 'Automatic LIVE session ended'
      else 'Automation resolved'
    end,
    case
      when s.auto_manage_live is not true then
        'Turn on Hands-Free LIVE to automate this stop.'
      when s.auto_end_resolved_at is not null
        and s.auto_end_outcome = 'went_offline' then
        'TruckTap automatically ended the exact LIVE session created for this stop.'
      when s.auto_end_resolved_at is not null then
        'The scheduled end made no change because an owner action or newer session had already taken over.'
      when s.auto_live_started_at is not null
        and t.is_open is true
        and t.live_stop_id = s.id then
        'This stop currently owns the automatic LIVE session.'
      when s.auto_live_started_at is not null
        and t.is_open is true
        and t.live_stop_id is distinct from s.id then
        'An owner action or another session took over; this stop cannot close it.'
      when s.auto_live_started_at is not null
        and t.is_open is not true then
        'An owner action ended this session; TruckTap will not automatically reopen it.'
      when v_system_enabled is not true then
        'TruckTap has paused new scheduled starts; owned scheduled ends remain protected.'
      when s.auto_start_resolved_at is null
        and s.auto_start_outcome = 'retrying_previous_stop' then
        'TruckTap is briefly rechecking after the previous scheduled stop.'
      when s.auto_start_resolved_at is null
        and s.auto_start_outcome = 'retrying_manual_live' then
        'Your manual session is preserved; TruckTap will retry only during this stop''s start grace window.'
      when s.auto_start_resolved_at is null then
        'TruckTap will use this stop location at the scheduled time.'
      when s.auto_start_outcome = 'blocked_manual_live' then
        'Your manual LIVE session was preserved and was not replaced.'
      when s.auto_start_outcome = 'blocked_overlap' then
        'Another scheduled stop kept ownership; this stop did not replace it.'
      when s.auto_start_outcome = 'missed_start_window' then
        'TruckTap did not start an expired or excessively late stop.'
      else
        'No unsafe LIVE state change was made.'
    end,
    s.auto_start_resolved_at,
    s.auto_live_started_at,
    s.auto_end_resolved_at
  from public.upcoming_stops s
  join public.trucks t on t.id = s.truck_id
  where s.truck_id = p_truck_id
  order by s.starts_at, s.id;
end;
$$;

revoke all on function public.get_upcoming_stop_automation_statuses(uuid)
from public, anon;
grant execute on function public.get_upcoming_stop_automation_statuses(uuid)
to authenticated;

create or replace function public.configure_upcoming_stop_live_automation(
  p_stop_id uuid,
  p_enabled boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_timezone text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_stop public.upcoming_stops;
  v_owner_id uuid;
  v_system_enabled boolean;
  v_truck_is_open boolean;
  v_live_stop_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_enabled is null then
    raise exception 'Automation enabled value is required' using errcode = '22023';
  end if;

  select s.*
  into v_stop
  from public.upcoming_stops s
  where s.id = p_stop_id
  for update;

  if not found then
    raise exception 'Upcoming stop % not found', p_stop_id using errcode = 'P0002';
  end if;

  select t.owner_id, t.is_open, t.live_stop_id
  into v_owner_id, v_truck_is_open, v_live_stop_id
  from public.trucks t
  where t.id = v_stop.truck_id
  for update;

  if v_owner_id is distinct from auth.uid()
    and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  then
    raise exception 'Not authorized to configure stop %', p_stop_id
      using errcode = '42501';
  end if;

  if p_enabled then
    select s.enabled
    into v_system_enabled
    from private.hands_free_live_settings s
    where s.singleton is true;

    if v_system_enabled is not true then
      raise exception 'Hands-Free LIVE is temporarily unavailable'
        using errcode = '55000';
    end if;

    if v_stop.status <> 'scheduled' then
      raise exception 'Hands-Free LIVE requires scheduled status'
        using errcode = '23514';
    end if;

    if v_stop.starts_at <= statement_timestamp() then
      raise exception 'Hands-Free LIVE can only be enabled before a stop starts'
        using errcode = '23514';
    end if;

    update public.upcoming_stops
    set
      latitude = p_latitude,
      longitude = p_longitude,
      timezone = nullif(btrim(p_timezone), ''),
      auto_manage_live = true,
      auto_start_resolved_at = null,
      auto_live_started_at = null,
      auto_end_resolved_at = null,
      automation_cancelled_at = null,
      auto_start_first_attempt_at = null,
      auto_start_retry_count = 0,
      auto_start_outcome = null,
      auto_end_outcome = null
    where id = p_stop_id;
  else
    if v_truck_is_open is true and v_live_stop_id = p_stop_id then
      raise exception 'This stop owns the current LIVE session; Stop Serving before turning automation off'
        using errcode = '55000';
    end if;

    update public.upcoming_stops
    set
      auto_manage_live = false,
      automation_cancelled_at = coalesce(automation_cancelled_at, statement_timestamp()),
      auto_start_resolved_at = coalesce(auto_start_resolved_at, statement_timestamp()),
      auto_start_outcome = coalesce(auto_start_outcome, 'cancelled')
    where id = p_stop_id;
  end if;

  return true;
end;
$$;

revoke all on function public.configure_upcoming_stop_live_automation(
  uuid, boolean, double precision, double precision, text
) from public, anon;
grant execute on function public.configure_upcoming_stop_live_automation(
  uuid, boolean, double precision, double precision, text
) to authenticated;

create or replace function public.set_hands_free_live_confirmation_notifications(
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_enabled is null then
    raise exception 'Confirmation notification preference is required'
      using errcode = '22023';
  end if;

  update public.profiles
  set notify_hands_free_live_confirmations = p_enabled
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return p_enabled;
end;
$$;

revoke all on function public.set_hands_free_live_confirmation_notifications(boolean)
from public, anon;
grant execute on function public.set_hands_free_live_confirmation_notifications(boolean)
to authenticated;

create or replace function private.process_hands_free_live_schedule(
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_settings private.hands_free_live_settings;
  v_run_id uuid := gen_random_uuid();
  v_candidate record;
  v_changed boolean;
  v_reason text;
  v_result_live_started_at timestamptz;
  v_result_live_stop_id uuid;
  v_owner_end_at timestamptz;
  v_first_attempt_at timestamptz;
  v_error_state text;
  v_error_message text;
  v_starts_changed integer := 0;
  v_ends_changed integer := 0;
  v_safe_noops integer := 0;
  v_start_retries integer := 0;
  v_missed_starts integer := 0;
  v_failures integer := 0;
begin
  if p_now is null then
    raise exception 'Processor timestamp is required' using errcode = '22023';
  end if;

  if not pg_try_advisory_xact_lock(7218012001) then
    return jsonb_build_object(
      'run_id', v_run_id,
      'starts_changed', 0,
      'ends_changed', 0,
      'safe_noops', 0,
      'start_retries', 0,
      'missed_starts', 0,
      'failures', 0,
      'lock_skipped', true
    );
  end if;

  select s.*
  into v_settings
  from private.hands_free_live_settings s
  where s.singleton is true;

  if not found then
    raise exception 'Hands-Free LIVE processor settings are missing'
      using errcode = '55000';
  end if;

  -- Ends run first so a back-to-back stop can acquire ownership in this pass.
  for v_candidate in
    select
      s.id,
      s.truck_id,
      s.ends_at,
      s.location_text,
      s.auto_live_started_at
    from public.upcoming_stops s
    where s.auto_manage_live is true
      and s.auto_live_started_at is not null
      and s.auto_end_resolved_at is null
      and s.automation_cancelled_at is null
      and s.ends_at + v_settings.end_grace <= p_now
    order by s.ends_at, s.id
    limit v_settings.batch_size
    for update of s skip locked
  loop
    begin
      select r.changed, r.reason
      into v_changed, v_reason
      from private.transition_truck_live(
        'go_offline',
        v_candidate.truck_id,
        'schedule',
        null,
        null,
        null,
        v_candidate.id,
        v_candidate.id,
        null,
        jsonb_build_object(
          'processor', 'hands_free_live',
          'run_id', v_run_id,
          'scheduled_ends_at', v_candidate.ends_at,
          'processed_at', p_now
        ),
        v_candidate.auto_live_started_at,
        true
      ) r;

      if v_changed then
        update public.upcoming_stops
        set
          auto_end_resolved_at = p_now,
          auto_end_outcome = 'went_offline'
        where id = v_candidate.id;
        v_ends_changed := v_ends_changed + 1;
      elsif v_reason in ('already_offline', 'live_stop_mismatch', 'live_session_restarted') then
        update public.upcoming_stops
        set
          auto_end_resolved_at = p_now,
          auto_end_outcome = v_reason
        where id = v_candidate.id;
        v_safe_noops := v_safe_noops + 1;
      else
        v_failures := v_failures + 1;
      end if;

      insert into private.hands_free_live_processor_attempts (
        run_id, stop_id, truck_id, phase, outcome, reason, attempted_at
      ) values (
        v_run_id,
        v_candidate.id,
        v_candidate.truck_id,
        'end',
        case when v_changed then 'changed' else 'noop' end,
        v_reason,
        p_now
      );
    exception
      when others then
        get stacked diagnostics
          v_error_state = returned_sqlstate,
          v_error_message = message_text;
        v_failures := v_failures + 1;

        insert into private.hands_free_live_processor_attempts (
          run_id, stop_id, truck_id, phase, outcome, reason,
          sqlstate, error_message, attempted_at
        ) values (
          v_run_id,
          v_candidate.id,
          v_candidate.truck_id,
          'end',
          'error',
          'transition_exception',
          v_error_state,
          left(regexp_replace(v_error_message, E'[\\n\\r\\t]+', ' ', 'g'), 500),
          p_now
        );

        raise warning
          'Hands-Free LIVE end failed: stop_id=% truck_id=% SQLSTATE=%',
          v_candidate.id,
          v_candidate.truck_id,
          v_error_state;
    end;
  end loop;

  -- The kill switch blocks new starts but intentionally continues owned ends.
  -- Pausing the feature must not strand an already-automatic LIVE session.
  if v_settings.enabled is not true then
    return jsonb_build_object(
      'run_id', v_run_id,
      'starts_changed', 0,
      'ends_changed', v_ends_changed,
      'safe_noops', v_safe_noops,
      'start_retries', 0,
      'missed_starts', 0,
      'failures', v_failures,
      'lock_skipped', false,
      'disabled', true
    );
  end if;

  for v_candidate in
    select
      s.id,
      s.truck_id,
      s.starts_at,
      s.ends_at,
      s.location_text,
      s.latitude,
      s.longitude,
      s.auto_start_first_attempt_at,
      s.auto_start_retry_count,
      s.auto_start_outcome
    from public.upcoming_stops s
    where s.auto_manage_live is true
      and s.status = 'scheduled'
      and s.auto_start_resolved_at is null
      and s.automation_cancelled_at is null
      and s.starts_at <= p_now
    order by s.starts_at, s.id
    limit v_settings.batch_size
    for update of s skip locked
  loop
    begin
      if p_now > least(
        v_candidate.ends_at,
        v_candidate.starts_at + v_settings.start_grace
      ) then
        v_reason := case
          when v_candidate.auto_start_outcome = 'retrying_manual_live'
            then 'blocked_manual_live'
          else 'missed_start_window'
        end;

        update public.upcoming_stops
        set
          auto_start_resolved_at = p_now,
          auto_start_outcome = v_reason,
          auto_end_resolved_at = case
            when ends_at + v_settings.end_grace <= p_now then p_now
            else auto_end_resolved_at
          end,
          auto_end_outcome = case
            when ends_at + v_settings.end_grace <= p_now then 'never_started'
            else auto_end_outcome
          end
        where id = v_candidate.id;

        if v_reason = 'blocked_manual_live' then
          v_safe_noops := v_safe_noops + 1;
        else
          v_missed_starts := v_missed_starts + 1;
        end if;

        insert into private.hands_free_live_processor_attempts (
          run_id, stop_id, truck_id, phase, outcome, reason, attempted_at
        ) values (
          v_run_id, v_candidate.id, v_candidate.truck_id,
          'start', 'noop', v_reason, p_now
        );
        continue;
      end if;

      select
        r.changed,
        r.reason,
        (r.truck_row).live_started_at,
        (r.truck_row).live_stop_id
      into
        v_changed,
        v_reason,
        v_result_live_started_at,
        v_result_live_stop_id
      from private.transition_truck_live(
        'go_live',
        v_candidate.truck_id,
        'schedule',
        v_candidate.latitude,
        v_candidate.longitude,
        v_candidate.location_text,
        v_candidate.id,
        null,
        null,
        jsonb_build_object(
          'processor', 'hands_free_live',
          'run_id', v_run_id,
          'scheduled_starts_at', v_candidate.starts_at,
          'scheduled_ends_at', v_candidate.ends_at,
          'processed_at', p_now,
          'retry_count', v_candidate.auto_start_retry_count
        ),
        null,
        false
      ) r;

      if v_changed then
        update public.upcoming_stops
        set
          auto_start_first_attempt_at = coalesce(auto_start_first_attempt_at, p_now),
          auto_start_resolved_at = p_now,
          auto_live_started_at = v_result_live_started_at,
          auto_start_outcome = 'went_live'
        where id = v_candidate.id;

        v_starts_changed := v_starts_changed + 1;

        insert into private.hands_free_live_processor_attempts (
          run_id, stop_id, truck_id, phase, outcome, reason, attempted_at
        ) values (
          v_run_id, v_candidate.id, v_candidate.truck_id,
          'start', 'changed', 'went_live', p_now
        );
        continue;
      end if;

      if v_reason <> 'already_live' then
        v_failures := v_failures + 1;
        insert into private.hands_free_live_processor_attempts (
          run_id, stop_id, truck_id, phase, outcome, reason, attempted_at
        ) values (
          v_run_id, v_candidate.id, v_candidate.truck_id,
          'start', 'noop', v_reason, p_now
        );
        continue;
      end if;

      if v_result_live_stop_id = v_candidate.id then
        update public.upcoming_stops
        set
          auto_start_first_attempt_at = coalesce(auto_start_first_attempt_at, p_now),
          auto_start_resolved_at = p_now,
          auto_live_started_at = v_result_live_started_at,
          auto_start_outcome = 'already_owned'
        where id = v_candidate.id;
        v_safe_noops := v_safe_noops + 1;
      elsif v_result_live_stop_id is null then
        update public.upcoming_stops
        set
          auto_start_first_attempt_at = coalesce(auto_start_first_attempt_at, p_now),
          auto_start_retry_count = auto_start_retry_count + 1,
          auto_start_outcome = 'retrying_manual_live'
        where id = v_candidate.id;
        v_start_retries := v_start_retries + 1;
      else
        select s.ends_at + v_settings.end_grace
        into v_owner_end_at
        from public.upcoming_stops s
        where s.id = v_result_live_stop_id;

        v_first_attempt_at := coalesce(
          v_candidate.auto_start_first_attempt_at,
          p_now
        );

        if v_owner_end_at is not null
          and v_owner_end_at <= p_now + v_settings.start_retry_window
          and v_candidate.auto_start_retry_count < v_settings.max_start_retries
          and p_now < least(
            v_candidate.ends_at,
            v_candidate.starts_at + v_settings.start_grace,
            v_first_attempt_at + v_settings.start_retry_window
          )
        then
          update public.upcoming_stops
          set
            auto_start_first_attempt_at = v_first_attempt_at,
            auto_start_retry_count = auto_start_retry_count + 1,
            auto_start_outcome = 'retrying_previous_stop'
          where id = v_candidate.id;
          v_start_retries := v_start_retries + 1;
        else
          update public.upcoming_stops
          set
            auto_start_first_attempt_at = v_first_attempt_at,
            auto_start_resolved_at = p_now,
            auto_start_outcome = 'blocked_overlap'
          where id = v_candidate.id;
          v_safe_noops := v_safe_noops + 1;
        end if;
      end if;

      insert into private.hands_free_live_processor_attempts (
        run_id, stop_id, truck_id, phase, outcome, reason, attempted_at
      ) values (
        v_run_id,
        v_candidate.id,
        v_candidate.truck_id,
        'start',
        case
          when v_result_live_stop_id is null then 'retry'
          when v_result_live_stop_id is not null
            and v_result_live_stop_id <> v_candidate.id
            and v_candidate.auto_start_retry_count < v_settings.max_start_retries
            then 'retry_or_noop'
          else 'noop'
        end,
        case
          when v_result_live_stop_id = v_candidate.id then 'already_owned'
          when v_result_live_stop_id is null then 'manual_live_present'
          else 'scheduled_owner_present'
        end,
        p_now
      );
    exception
      when others then
        get stacked diagnostics
          v_error_state = returned_sqlstate,
          v_error_message = message_text;
        v_failures := v_failures + 1;

        insert into private.hands_free_live_processor_attempts (
          run_id, stop_id, truck_id, phase, outcome, reason,
          sqlstate, error_message, attempted_at
        ) values (
          v_run_id,
          v_candidate.id,
          v_candidate.truck_id,
          'start',
          'error',
          'transition_exception',
          v_error_state,
          left(regexp_replace(v_error_message, E'[\\n\\r\\t]+', ' ', 'g'), 500),
          p_now
        );

        raise warning
          'Hands-Free LIVE start failed: stop_id=% truck_id=% SQLSTATE=%',
          v_candidate.id,
          v_candidate.truck_id,
          v_error_state;
    end;
  end loop;

  return jsonb_build_object(
    'run_id', v_run_id,
    'starts_changed', v_starts_changed,
    'ends_changed', v_ends_changed,
    'safe_noops', v_safe_noops,
    'start_retries', v_start_retries,
    'missed_starts', v_missed_starts,
    'failures', v_failures,
    'lock_skipped', false,
    'disabled', false
  );
end;
$$;

revoke all on function private.process_hands_free_live_schedule(timestamptz)
from public, anon, authenticated, service_role;

create or replace function public.process_hands_free_live_schedule()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_result jsonb;
  v_reconciled integer;
begin
  v_result := private.process_hands_free_live_schedule(v_now);
  v_reconciled :=
    private.reconcile_hands_free_live_notification_deliveries(v_now);

  return v_result || jsonb_build_object(
    'stale_notification_deliveries_failed',
    v_reconciled
  );
end;
$$;

comment on function public.process_hands_free_live_schedule() is
'Service-only scheduled processor. Uses canonical CAS transitions, ends before starts, bounded retries, and per-stop failure isolation.';

revoke all on function public.process_hands_free_live_schedule()
from public, anon, authenticated;
grant execute on function public.process_hands_free_live_schedule()
to service_role;

create or replace function private.notify_hands_free_live_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_webhook_secret text;
  v_function_url text;
  v_error_state text;
  v_transition_owner name;
begin
  if new.source <> 'schedule' or new.action not in ('go_live', 'go_offline') then
    return new;
  end if;

  select pg_get_userbyid(p.proowner)
  into v_transition_owner
  from pg_catalog.pg_proc p
  where p.pronamespace = to_regnamespace('private')
    and p.proname = 'transition_truck_live'
    and p.pronargs = 12;

  if coalesce(current_setting('trucktap.canonical_live_transition', true), '') <> 'on'
    or v_transition_owner is null
    or current_user <> v_transition_owner
  then
    raise warning
      'Ignoring non-canonical schedule audit event % for confirmation delivery',
      new.id;
    return new;
  end if;

  select s.decrypted_secret
  into v_webhook_secret
  from vault.decrypted_secrets s
  where s.name = 'hands_free_live_webhook_secret'
  limit 1;

  select s.decrypted_secret
  into v_function_url
  from vault.decrypted_secrets s
  where s.name = 'hands_free_live_edge_function_url'
  limit 1;

  if v_webhook_secret is null or length(v_webhook_secret) = 0
    or v_function_url is null or length(v_function_url) = 0
  then
    raise warning
      'Hands-Free LIVE confirmation push is not configured for event %',
      new.id;
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_function_url, '/') || '/notify-hands-free-live-transition',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-TruckTap-Webhook-Secret', v_webhook_secret
    ),
    body := jsonb_build_object('event_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    get stacked diagnostics v_error_state = returned_sqlstate;
    raise warning
      'Hands-Free LIVE confirmation enqueue failed for event % (SQLSTATE %)',
      new.id,
      coalesce(v_error_state, 'unknown');
    return new;
end;
$$;

revoke all on function private.notify_hands_free_live_transition()
from public, anon, authenticated, service_role;

drop trigger if exists notify_hands_free_live_transition
on public.truck_live_events;

create trigger notify_hands_free_live_transition
after insert on public.truck_live_events
for each row
when (new.source = 'schedule')
execute function private.notify_hands_free_live_transition();

do $$
begin
  if to_regnamespace('cron') is null then
    raise warning 'pg_cron is unavailable; Hands-Free LIVE processor was not scheduled';
  elsif not exists (
    select 1
    from cron.job
    where jobname = 'process_hands_free_live_schedule'
  ) then
    perform cron.schedule(
      'process_hands_free_live_schedule',
      '* * * * *',
      'select public.process_hands_free_live_schedule();'
    );
  end if;
end;
$$;
