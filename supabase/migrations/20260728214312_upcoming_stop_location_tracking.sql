-- Part 2 of the Hands-Free LIVE locations plan: geocode every stop at
-- create/edit time, not just ones with automation enabled, so coordinates
-- exist for future features regardless of automation status.
--
-- latitude/longitude/timezone were previously writable only through
-- configure_upcoming_stop_live_automation, which also flips auto_manage_live
-- and re-validates automation eligibility - the wrong tool for "just store
-- coordinates on a stop that may have automation off". This adds a narrow,
-- dedicated RPC for that, plus attempt/failure tracking so a failed
-- background geocode is recorded rather than silently dropped.

alter table public.upcoming_stops
  add column if not exists location_geocode_attempted_at timestamptz null,
  add column if not exists location_geocode_failed_at timestamptz null;

comment on column public.upcoming_stops.location_geocode_attempted_at is
'Timestamp of the most recent geocode attempt for this stop''s location_text, success or failure. Null means never attempted.';

comment on column public.upcoming_stops.location_geocode_failed_at is
'Set when the most recent geocode attempt failed; cleared on the next successful attempt. Lets the UI distinguish "never attempted" from "attempted and failed" when latitude/longitude are null.';

-- Broaden coordinate/timezone format validation to run whenever those fields
-- are set to non-null values, independent of auto_manage_live, so stops
-- without automation still get well-formed data. The existing
-- automation-required block below is unchanged (still independently
-- re-validates when auto_manage_live is true) - this is a pure addition.
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

  -- Universal coordinate/timezone format validation, independent of
  -- auto_manage_live: runs whenever latitude/longitude/timezone are being
  -- set to non-null values, so bad data can't silently land on a stop just
  -- because automation happens to be off for it.
  if (
    tg_op = 'INSERT'
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.timezone is distinct from old.timezone
  ) and (new.latitude is not null or new.longitude is not null or new.timezone is not null)
  then
    if new.latitude is null
      or new.latitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      or new.latitude < -90
      or new.latitude > 90
    then
      raise exception 'Stop latitude must be finite and between -90 and 90'
        using errcode = '23514';
    end if;

    if new.longitude is null
      or new.longitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      or new.longitude < -180
      or new.longitude > 180
    then
      raise exception 'Stop longitude must be finite and between -180 and 180'
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
      raise exception 'Stop timezone must be a valid IANA timezone'
        using errcode = '23514';
    end if;
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

-- Coordinate/timezone/attempt-status write for a stop, independent of
-- automation. Does not touch auto_manage_live or any automation-eligibility
-- field - ownership-checked the same way as every other owner-scoped RPC in
-- this schema.
create or replace function public.set_upcoming_stop_location(
  p_stop_id uuid,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_timezone text default null,
  p_failed boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select t.owner_id into v_owner_id
  from public.upcoming_stops s
  join public.trucks t on t.id = s.truck_id
  where s.id = p_stop_id;

  if not found then
    raise exception 'Upcoming stop % not found', p_stop_id using errcode = 'P0002';
  end if;

  if v_owner_id is distinct from auth.uid()
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  then
    raise exception 'Not authorized to update stop %', p_stop_id using errcode = '42501';
  end if;

  if p_failed then
    update public.upcoming_stops
    set location_geocode_attempted_at = statement_timestamp(),
        location_geocode_failed_at = statement_timestamp()
    where id = p_stop_id;
    return true;
  end if;

  if p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180
  then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;

  update public.upcoming_stops
  set latitude = p_latitude,
      longitude = p_longitude,
      timezone = nullif(btrim(p_timezone), ''),
      location_geocode_attempted_at = statement_timestamp(),
      location_geocode_failed_at = null
  where id = p_stop_id;

  return true;
end;
$$;

revoke all on function public.set_upcoming_stop_location(
  uuid, double precision, double precision, text, boolean
) from public, anon;
grant execute on function public.set_upcoming_stop_location(
  uuid, double precision, double precision, text, boolean
) to authenticated;

-- Coordinates and geocode-attempt status are deliberately not part of the
-- public/authenticated column-scoped select grant on upcoming_stops (see
-- 20260718000000_hands_free_live_phase_1a.sql's "select(*) cannot expose
-- coordinates" note) - any logged-in customer can already SELECT a public
-- truck's stops, and broadening that grant would hand exact coordinates to
-- every viewer, not just the owner. This RPC is the owner/admin-only read
-- path instead, mirroring get_upcoming_stop_automation_statuses.
create or replace function public.get_upcoming_stop_location_statuses(
  p_truck_id uuid
)
returns table (
  stop_id uuid,
  latitude double precision,
  longitude double precision,
  timezone text,
  location_geocode_attempted_at timestamptz,
  location_geocode_failed_at timestamptz
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
    raise exception 'Not authorized to read location status for truck %', p_truck_id
      using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.latitude,
    s.longitude,
    s.timezone,
    s.location_geocode_attempted_at,
    s.location_geocode_failed_at
  from public.upcoming_stops s
  where s.truck_id = p_truck_id;
end;
$$;

revoke all on function public.get_upcoming_stop_location_statuses(uuid)
from public, anon;
grant execute on function public.get_upcoming_stop_location_statuses(uuid)
to authenticated;
