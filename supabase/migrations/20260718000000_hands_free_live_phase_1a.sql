-- Hands-Free LIVE Phase 1A
--
-- Scope: scheduled-stop start/stop only. Operating Hours are deliberately
-- excluded. There is no auto-pause, auto-resume, or auto-announcement behavior.
--
-- Trust rules:
--   * Manual owner actions always win.
--   * trucks.live_stop_id owns an automated LIVE session.
--   * An automatic end may close only the session owned by its stop.
--   * When state is uncertain, resolve closed or return a safe no-op rather
--     than closing a different/newer session.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

alter table public.upcoming_stops
  add column if not exists latitude double precision null,
  add column if not exists longitude double precision null,
  add column if not exists timezone text null,
  add column if not exists auto_manage_live boolean not null default false,
  add column if not exists auto_start_resolved_at timestamptz null,
  add column if not exists auto_live_started_at timestamptz null,
  add column if not exists auto_end_resolved_at timestamptz null,
  add column if not exists automation_cancelled_at timestamptz null;

alter table public.trucks
  add column if not exists live_stop_id uuid null
    references public.upcoming_stops(id) on delete set null;

create index if not exists upcoming_stops_auto_manage_starts_idx
  on public.upcoming_stops (starts_at)
  where auto_manage_live is true;

create index if not exists trucks_live_stop_id_idx
  on public.trucks (live_stop_id)
  where live_stop_id is not null;

comment on column public.upcoming_stops.auto_manage_live is
'Opt-in for automatic scheduled-stop LIVE start/stop. Defaults off. Operating Hours never set this field and never trigger LIVE.';

comment on column public.upcoming_stops.auto_start_resolved_at is
'Internal lifecycle marker: the scheduled start decision has been resolved. Not directly client-writable.';

comment on column public.upcoming_stops.auto_live_started_at is
'Internal lifecycle marker: this stop successfully acquired LIVE-session ownership. Not directly client-writable.';

comment on column public.upcoming_stops.auto_end_resolved_at is
'Internal lifecycle marker: the scheduled end decision has been resolved. Not directly client-writable.';

comment on column public.upcoming_stops.automation_cancelled_at is
'Internal lifecycle marker: scheduled automation was cancelled. Not directly client-writable.';

comment on column public.trucks.live_stop_id is
'Nullable owner of the current scheduled-stop LIVE session. Manual Go LIVE clears it; every successful Go Offline clears it. An automatic stop must match it before closing.';

create or replace function private.validate_upcoming_stop_automation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_relevant_change boolean := true;
  v_live_stop_id uuid;
  v_truck_is_open boolean;
begin
  if tg_op = 'DELETE' then
    select t.live_stop_id, t.is_open
    into v_live_stop_id, v_truck_is_open
    from public.trucks t
    where t.id = old.truck_id
    for update;

    if v_truck_is_open is true and v_live_stop_id = old.id then
      raise exception 'Stop % owns the current LIVE session; go offline before deleting it', old.id
        using errcode = '55000';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Lock the truck before allowing an ownership-ineligible change. This
    -- serializes the edit with the canonical transition's truck lock.
    if new.auto_manage_live is not true
      or new.status <> 'scheduled'
      or new.truck_id is distinct from old.truck_id
    then
      select t.live_stop_id, t.is_open
      into v_live_stop_id, v_truck_is_open
      from public.trucks t
      where t.id = old.truck_id
      for update;

      if v_truck_is_open is true and v_live_stop_id = old.id then
        raise exception 'Stop % owns the current LIVE session; go offline before disabling, cancelling, completing, delaying, selling out, or moving it', old.id
          using errcode = '55000';
      end if;
    end if;

    -- Phase 1A uses the smallest unambiguous contract: once automatic start
    -- has resolved (successfully or otherwise), both window endpoints freeze.
    if old.auto_manage_live is true
      and (
        old.auto_start_resolved_at is not null
        or old.auto_live_started_at is not null
      )
      and (
        new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at
      )
    then
      raise exception 'Automation window is frozen after automatic start resolves'
        using errcode = '55000';
    end if;

    v_relevant_change :=
      new.auto_manage_live is distinct from old.auto_manage_live
      or new.status is distinct from old.status
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.location_text is distinct from old.location_text
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.timezone is distinct from old.timezone;
  end if;

  if new.auto_manage_live is not true then
    return new;
  end if;

  if tg_op = 'UPDATE' and not v_relevant_change then
    return new;
  end if;

  if new.status <> 'scheduled' then
    raise exception 'Hands-Free LIVE requires scheduled status'
      using errcode = '23514';
  end if;

  if new.ends_at <= new.starts_at then
    raise exception 'Hands-Free LIVE requires ends_at after starts_at'
      using errcode = '23514';
  end if;

  if new.location_text is null or length(btrim(new.location_text)) = 0 then
    raise exception 'Hands-Free LIVE requires a nonblank location'
      using errcode = '23514';
  end if;

  if new.latitude is null
    or new.latitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    or new.latitude < -90
    or new.latitude > 90
  then
    raise exception 'Hands-Free LIVE requires a finite latitude between -90 and 90'
      using errcode = '23514';
  end if;

  if new.longitude is null
    or new.longitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    or new.longitude < -180
    or new.longitude > 180
  then
    raise exception 'Hands-Free LIVE requires a finite longitude between -180 and 180'
      using errcode = '23514';
  end if;

  if new.timezone is null
    or length(btrim(new.timezone)) = 0
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names tz
      where tz.name = new.timezone
    )
  then
    raise exception 'Hands-Free LIVE requires a valid IANA timezone'
      using errcode = '23514';
  end if;

  -- A permanent CHECK using now() would make row validity drift with time.
  -- Before start resolution, every relevant edit must keep starts_at future.
  if (
    tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and old.auto_start_resolved_at is null
      and old.auto_live_started_at is null
    )
  ) and new.starts_at <= statement_timestamp()
  then
    raise exception 'An armed Hands-Free LIVE stop must start in the future until automatic start resolves'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_upcoming_stop_automation
  on public.upcoming_stops;

create trigger validate_upcoming_stop_automation
before insert or update or delete on public.upcoming_stops
for each row
execute function private.validate_upcoming_stop_automation();

revoke all on function private.validate_upcoming_stop_automation() from public;
revoke all on function private.validate_upcoming_stop_automation() from anon;
revoke all on function private.validate_upcoming_stop_automation() from authenticated;

-- The current RLS policy intentionally lets customers read visible-truck stops.
-- Replace table-level SELECT with a safe legacy display-column grant so select(*)
-- cannot expose coordinates, automation configuration, or lifecycle markers.
revoke select on table public.upcoming_stops from anon;
revoke select on table public.upcoming_stops from authenticated;

grant select (
  id,
  truck_id,
  starts_at,
  ends_at,
  location_text,
  note,
  status,
  created_at,
  updated_at
) on table public.upcoming_stops to anon, authenticated;

-- Existing stop CRUD remains compatible. All new automation/configuration and
-- lifecycle fields require a future controlled SECURITY DEFINER owner RPC or an
-- internal/server process; clients cannot write them directly.
revoke insert, update on table public.upcoming_stops from anon;
revoke insert, update on table public.upcoming_stops from authenticated;
revoke delete on table public.upcoming_stops from anon;

grant insert (
  truck_id,
  starts_at,
  ends_at,
  location_text,
  note,
  status,
  created_at,
  updated_at
) on table public.upcoming_stops to authenticated;

grant update (
  starts_at,
  ends_at,
  location_text,
  note,
  status,
  updated_at
) on table public.upcoming_stops to authenticated;

grant delete on table public.upcoming_stops to authenticated;

create or replace function private.transition_truck_live(
  p_action text,
  p_truck_id uuid,
  p_source text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_stop_id uuid,
  p_expected_live_stop_id uuid,
  p_actor_user_id uuid,
  p_metadata jsonb,
  p_expected_live_started_at timestamptz,
  p_require_live_started_at_match boolean
)
returns table (
  changed boolean,
  reason text,
  truck_row public.trucks
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_truck public.trucks;
  v_previous_stop_id uuid;
  v_location_label text;
  v_location_rows integer;
begin
  if p_action not in ('go_live', 'go_offline') then
    raise exception 'Invalid LIVE transition action: %', p_action
      using errcode = '22023';
  end if;

  if p_source not in ('manual', 'schedule', 'nudge_confirmation', 'expiration', 'archive') then
    raise exception 'Invalid LIVE status source: %', p_source
      using errcode = '22023';
  end if;

  if p_metadata is not null and jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'LIVE transition metadata must be a JSON object'
      using errcode = '22023';
  end if;

  if p_action = 'go_live' and p_source = 'schedule' and p_stop_id is null then
    raise exception 'Scheduled Go LIVE requires a non-null stop ID'
      using errcode = '22023';
  end if;

  if p_action = 'go_offline' and p_source = 'schedule' then
    if p_expected_live_stop_id is null then
      raise exception 'Scheduled Go Offline requires a non-null expected live_stop_id'
        using errcode = '22023';
    end if;

    if p_expected_live_started_at is null then
      raise exception 'Scheduled Go Offline requires expected live_started_at'
        using errcode = '22023';
    end if;

    if p_require_live_started_at_match is not true then
      raise exception 'Scheduled Go Offline requires live-session restart protection'
        using errcode = '22023';
    end if;
  end if;

  select t.*
  into v_truck
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then
    raise exception 'Truck % not found', p_truck_id
      using errcode = 'P0002';
  end if;

  if p_action = 'go_live' then
    if p_latitude is null
      or p_latitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      or p_latitude < -90
      or p_latitude > 90
      or p_longitude is null
      or p_longitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      or p_longitude < -180
      or p_longitude > 180
    then
      raise exception 'Go LIVE requires finite coordinates in range'
        using errcode = '22023';
    end if;

    if p_location_label is null or length(btrim(p_location_label)) = 0 then
      raise exception 'Go LIVE requires a nonblank location label'
        using errcode = '22023';
    end if;

    if p_stop_id is not null then
      if p_source <> 'schedule' then
        raise exception 'Only schedule transitions may acquire stop ownership'
          using errcode = '22023';
      end if;

      if not exists (
        select 1
        from public.upcoming_stops s
        where s.id = p_stop_id
          and s.truck_id = p_truck_id
      ) then
        raise exception 'Scheduled stop % does not belong to truck %', p_stop_id, p_truck_id
          using errcode = '22023';
      end if;

      -- Manual always wins: scheduled automation never replaces any LIVE
      -- session. A processor can safely retry and receive this no-op.
      if v_truck.is_open is true then
        return query select false, 'already_live', v_truck;
        return;
      end if;
    end if;

    if to_regclass('public.locations') is null then
      raise exception 'Canonical locations table is unavailable'
        using errcode = '55000';
    end if;

    perform set_config('trucktap.canonical_live_transition', 'on', true);

    -- This project supports both the current locations schema and its legacy
    -- variant without updated_at. Locking the truck serializes canonical LIVE
    -- writes for a truck without assuming a deployed unique constraint that is
    -- absent from this repository's migrations. SQL text is fixed; values are
    -- bound, never interpolated.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'locations'
        and column_name = 'updated_at'
    ) then
      execute $location$
        update public.locations
        set
          latitude = $2,
          longitude = $3,
          label = $4,
          updated_at = $5
        where truck_id::text = $1::text
      $location$
      using p_truck_id, p_latitude, p_longitude, btrim(p_location_label), v_now;
    else
      execute $location$
        update public.locations
        set
          latitude = $2,
          longitude = $3,
          label = $4
        where truck_id::text = $1::text
      $location$
      using p_truck_id, p_latitude, p_longitude, btrim(p_location_label);
    end if;

    get diagnostics v_location_rows = row_count;

    if v_location_rows > 1 then
      raise exception 'Truck % has multiple canonical location rows', p_truck_id
        using errcode = '21000';
    end if;

    if v_location_rows = 0 then
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'locations'
          and column_name = 'updated_at'
      ) then
        execute $location$
          insert into public.locations (
            truck_id, latitude, longitude, label, updated_at
          ) values ($1, $2, $3, $4, $5)
        $location$
        using p_truck_id, p_latitude, p_longitude, btrim(p_location_label), v_now;
      else
        execute $location$
          insert into public.locations (
            truck_id, latitude, longitude, label
          ) values ($1, $2, $3, $4)
        $location$
        using p_truck_id, p_latitude, p_longitude, btrim(p_location_label);
      end if;
    end if;

    update public.trucks
    set
      is_open = true,
      live_started_at = v_now,
      last_live_updated_at = v_now,
      live_expires_at = v_now + interval '12 hours',
      live_source = p_source,
      live_stop_id = case when p_source = 'schedule' then p_stop_id else null end,
      updated_at = v_now
    where id = p_truck_id
    returning * into v_truck;

    insert into public.truck_live_events (
      truck_id,
      action,
      source,
      actor_user_id,
      stop_id,
      location_label,
      latitude,
      longitude,
      metadata
    ) values (
      p_truck_id,
      'go_live',
      p_source,
      p_actor_user_id,
      case when p_source = 'schedule' then p_stop_id else null end,
      btrim(p_location_label),
      p_latitude,
      p_longitude,
      coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object('transition', 'private.transition_truck_live')
    );

    return query select true, 'went_live', v_truck;
    return;
  end if;

  v_previous_stop_id := v_truck.live_stop_id;

  if (
    p_expected_live_stop_id is not null
    or p_require_live_started_at_match
  ) and v_truck.is_open is not true
  then
    return query select false, 'already_offline', v_truck;
    return;
  end if;

  -- Expected stop ownership is the scheduled-end compare-and-set. An old stop
  -- receives a safe no-op instead of closing a manual or newer stop session.
  if p_expected_live_stop_id is not null
    and v_truck.live_stop_id is distinct from p_expected_live_stop_id
  then
    return query select false, 'live_stop_mismatch', v_truck;
    return;
  end if;

  -- Stale cleanup also protects against a session restarted after its candidate
  -- scan. IS DISTINCT FROM intentionally handles legacy null timestamps.
  if p_require_live_started_at_match
    and v_truck.live_started_at is distinct from p_expected_live_started_at
  then
    return query select false, 'live_session_restarted', v_truck;
    return;
  end if;

  perform set_config('trucktap.canonical_live_transition', 'on', true);

  update public.trucks
  set
    is_open = false,
    live_expires_at = null,
    live_source = p_source,
    live_stop_id = null,
    updated_at = v_now
  where id = p_truck_id
  returning * into v_truck;

  select l.label
  into v_location_label
  from public.locations l
  where l.truck_id::text = p_truck_id::text
  limit 1;

  insert into public.truck_live_events (
    truck_id,
    action,
    source,
    actor_user_id,
    stop_id,
    location_label,
    metadata
  ) values (
    p_truck_id,
    'go_offline',
    p_source,
    p_actor_user_id,
    v_previous_stop_id,
    v_location_label,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('transition', 'private.transition_truck_live')
  );

  return query select true, 'went_offline', v_truck;
end;
$$;

comment on function private.transition_truck_live(
  text, uuid, text, double precision, double precision, text, uuid, uuid,
  uuid, jsonb, timestamptz, boolean
) is
'Private canonical LIVE/OFFLINE transition. Atomic state, audit, and Go LIVE location upsert. Scheduled starts never replace LIVE; scheduled ends require live_stop_id ownership. Start/stop only: no Operating Hours, pause, resume, or announcements.';

revoke all on function private.transition_truck_live(
  text, uuid, text, double precision, double precision, text, uuid, uuid,
  uuid, jsonb, timestamptz, boolean
) from public;
revoke all on function private.transition_truck_live(
  text, uuid, text, double precision, double precision, text, uuid, uuid,
  uuid, jsonb, timestamptz, boolean
) from anon;
revoke all on function private.transition_truck_live(
  text, uuid, text, double precision, double precision, text, uuid, uuid,
  uuid, jsonb, timestamptz, boolean
) from authenticated;

create or replace function private.guard_truck_live_state()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_transition_owner name;
begin
  if old.is_open is not distinct from new.is_open
    and old.last_live_updated_at is not distinct from new.last_live_updated_at
    and old.live_started_at is not distinct from new.live_started_at
    and old.live_expires_at is not distinct from new.live_expires_at
    and old.live_source is not distinct from new.live_source
    and old.live_stop_id is not distinct from new.live_stop_id
  then
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
    raise exception 'LIVE state must change through the canonical transition'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.guard_truck_live_state() is
'Rejects direct updates to LIVE/session fields. Only the owner-executed private canonical transition may mutate them; ordinary owner/admin table updates cannot forge live_stop_id or bypass auditing.';

drop trigger if exists guard_truck_live_state on public.trucks;

create trigger guard_truck_live_state
before update on public.trucks
for each row
execute function private.guard_truck_live_state();

revoke all on function private.guard_truck_live_state() from public;
revoke all on function private.guard_truck_live_state() from anon;
revoke all on function private.guard_truck_live_state() from authenticated;

create or replace function private.guard_open_truck_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_truck_id text;
  v_new_truck_id text;
  v_open_truck_exists boolean := false;
  v_truck record;
  v_transition_owner name;
begin
  if tg_op <> 'INSERT' then
    v_old_truck_id := old.truck_id::text;
  end if;

  if tg_op <> 'DELETE' then
    v_new_truck_id := new.truck_id::text;
  end if;

  -- Lock affected trucks in deterministic order. This closes the race where
  -- a direct location update observes Closed just before canonical Go LIVE.
  for v_truck in
    select t.is_open
    from public.trucks t
    where (
        t.id::text = v_old_truck_id
        or t.id::text = v_new_truck_id
      )
    order by t.id
    for update
  loop
    if v_truck.is_open is true then
      v_open_truck_exists := true;
    end if;
  end loop;

  if not v_open_truck_exists then
    if tg_op = 'DELETE' then
      return old;
    end if;
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
    raise exception 'An open truck location must change through the canonical LIVE transition'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function private.guard_open_truck_location() is
'Blocks direct insert/update/delete of an open truck canonical location. Offline location maintenance remains compatible; LIVE location mutation requires the private canonical transition.';

drop trigger if exists guard_open_truck_location on public.locations;

create trigger guard_open_truck_location
before insert or update or delete on public.locations
for each row
execute function private.guard_open_truck_location();

revoke all on function private.guard_open_truck_location() from public;
revoke all on function private.guard_open_truck_location() from anon;
revoke all on function private.guard_open_truck_location() from authenticated;

create or replace function public.go_live_truck(
  p_truck_id uuid,
  p_source text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.trucks
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_truck public.trucks;
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select t.owner_id
  into v_owner_id
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  if v_owner_id is distinct from auth.uid()
    and not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Not authorized to change LIVE status for truck %', p_truck_id
      using errcode = '42501';
  end if;

  perform private.require_supported_owner_client('go_live_truck');

  select (r.truck_row).*
  into v_truck
  from private.transition_truck_live(
    'go_live',
    p_truck_id,
    'manual',
    p_latitude,
    p_longitude,
    p_location_label,
    null,
    null,
    auth.uid(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'rpc', 'go_live_truck',
      'requested_source', p_source,
      'requested_source_trusted', false
    ),
    null,
    false
  ) r;

  return v_truck;
end;
$$;

comment on function public.go_live_truck(
  uuid, text, double precision, double precision, text, jsonb
) is
'Authenticated owner/admin Go LIVE wrapper. Signature is unchanged, but caller-supplied source is untrusted and the canonical source is always manual. Delegates atomic state, audit, and location upsert to the private transition; owner-initiated Go LIVE clears live_stop_id.';

revoke all on function public.go_live_truck(
  uuid, text, double precision, double precision, text, jsonb
) from public;
revoke all on function public.go_live_truck(
  uuid, text, double precision, double precision, text, jsonb
) from anon;
grant execute on function public.go_live_truck(
  uuid, text, double precision, double precision, text, jsonb
) to authenticated;

create or replace function public.go_offline_truck(
  p_truck_id uuid,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.trucks
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_truck public.trucks;
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select t.owner_id
  into v_owner_id
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  if v_owner_id is distinct from auth.uid()
    and not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Not authorized to change LIVE status for truck %', p_truck_id
      using errcode = '42501';
  end if;

  perform private.require_supported_owner_client('go_offline_truck');

  select (r.truck_row).*
  into v_truck
  from private.transition_truck_live(
    'go_offline',
    p_truck_id,
    'manual',
    null,
    null,
    null,
    null,
    null,
    auth.uid(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'rpc', 'go_offline_truck',
      'requested_source', p_source,
      'requested_source_trusted', false
    ),
    null,
    false
  ) r;

  return v_truck;
end;
$$;

comment on function public.go_offline_truck(uuid, text, jsonb) is
'Authenticated owner/admin Go Offline wrapper. Signature is unchanged, but caller-supplied source is untrusted and the canonical source is always manual. Delegates to the private transition; every successful owner action clears live_stop_id.';

revoke all on function public.go_offline_truck(uuid, text, jsonb) from public;
revoke all on function public.go_offline_truck(uuid, text, jsonb) from anon;
grant execute on function public.go_offline_truck(uuid, text, jsonb) to authenticated;

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
  -- Closed-safe fallback. Operating Hours are not consulted and never trigger
  -- LIVE. Expected live_started_at prevents a stale scan from closing a session
  -- that an owner manually restarted before the row lock was acquired.
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
        -- The exception block is a per-candidate subtransaction. Any partial
        -- work for this truck rolls back, while earlier/later candidates remain
        -- independent. A failed transition must not receive a go_offline event.
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
'Closes stale LIVE sessions through the private canonical transition. A live_started_at compare-and-set prevents closing a newer owner session. Per-truck exception isolation warns and continues without writing a false offline event or rolling back other successful candidates.';

revoke all on function public.close_stale_open_trucks() from public;
revoke all on function public.close_stale_open_trucks() from anon;
revoke all on function public.close_stale_open_trucks() from authenticated;
grant execute on function public.close_stale_open_trucks() to service_role;
