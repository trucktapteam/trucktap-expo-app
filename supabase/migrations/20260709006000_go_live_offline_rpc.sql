-- Trust Engine Phase 3: atomic LIVE state changes.
--
-- Today, goLive()/goOffline() perform a trucks update and a separate
-- truck_live_events audit insert as two independent client-issued network
-- calls. If the second call fails (network blip, transient error), the
-- LIVE status change still lands but no audit row is created, and nothing
-- surfaces the failure beyond a console log. This migration introduces two
-- single-purpose SECURITY DEFINER RPCs -- mirroring the existing
-- close_stale_open_trucks() design -- so the trucks update and the
-- truck_live_events insert always happen in one transaction: success or
-- failure together.
--
-- Both functions verify ownership (or admin role) explicitly in the
-- function body; SECURITY DEFINER alone is not relied on for
-- authorization. This replicates the same ownership guarantee
-- updateTruckDetails() enforces client-side today: the truck's owner_id
-- must match auth.uid(), or the caller must hold profiles.role = 'admin'.

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
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '12 hours';
  v_truck public.trucks;
begin
  if p_source not in ('manual', 'schedule', 'nudge_confirmation', 'expiration', 'archive') then
    raise exception 'Invalid LIVE status source: %', p_source using errcode = '22023';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.trucks
    where id = p_truck_id
      and owner_id = auth.uid()
  ) and not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Not authorized to change LIVE status for truck %', p_truck_id using errcode = '42501';
  end if;

  update public.trucks
  set
    is_open = true,
    live_started_at = v_now,
    last_live_updated_at = v_now,
    live_expires_at = v_expires,
    live_source = p_source,
    updated_at = v_now
  where id = p_truck_id
  returning * into v_truck;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  insert into public.truck_live_events (
    truck_id,
    action,
    source,
    actor_user_id,
    location_label,
    latitude,
    longitude,
    metadata
  ) values (
    p_truck_id,
    'go_live',
    p_source,
    auth.uid(),
    p_location_label,
    p_latitude,
    p_longitude,
    jsonb_build_object('rpc', 'go_live_truck') || coalesce(p_metadata, '{}'::jsonb)
  );

  return v_truck;
end;
$$;

comment on function public.go_live_truck(uuid, text, double precision, double precision, text, jsonb) is
'Canonical entry point for putting a truck LIVE. Atomically updates trucks LIVE fields and inserts a truck_live_events audit row in one transaction. Ownership (or admin role) is verified explicitly in the function body -- SECURITY DEFINER is not relied on alone.';

revoke all on function public.go_live_truck(uuid, text, double precision, double precision, text, jsonb) from public;
grant execute on function public.go_live_truck(uuid, text, double precision, double precision, text, jsonb) to authenticated;

create or replace function public.go_offline_truck(
  p_truck_id uuid,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.trucks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_truck public.trucks;
begin
  if p_source not in ('manual', 'schedule', 'nudge_confirmation', 'expiration', 'archive') then
    raise exception 'Invalid LIVE status source: %', p_source using errcode = '22023';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.trucks
    where id = p_truck_id
      and owner_id = auth.uid()
  ) and not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Not authorized to change LIVE status for truck %', p_truck_id using errcode = '42501';
  end if;

  -- last_live_updated_at / live_started_at are intentionally left untouched:
  -- they are the history of the most recent LIVE session, not a target of
  -- going offline. Only the fields below change.
  update public.trucks
  set
    is_open = false,
    live_expires_at = null,
    live_source = p_source,
    updated_at = v_now
  where id = p_truck_id
  returning * into v_truck;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  insert into public.truck_live_events (
    truck_id,
    action,
    source,
    actor_user_id,
    metadata
  ) values (
    p_truck_id,
    'go_offline',
    p_source,
    auth.uid(),
    jsonb_build_object('rpc', 'go_offline_truck') || coalesce(p_metadata, '{}'::jsonb)
  );

  return v_truck;
end;
$$;

comment on function public.go_offline_truck(uuid, text, jsonb) is
'Canonical entry point for taking a truck offline (manual stop, archive, schedule, nudge confirmation). Atomically updates trucks LIVE fields and inserts a truck_live_events audit row in one transaction. Ownership (or admin role) is verified explicitly in the function body -- SECURITY DEFINER is not relied on alone. Does not touch last_live_updated_at/live_started_at history.';

revoke all on function public.go_offline_truck(uuid, text, jsonb) from public;
grant execute on function public.go_offline_truck(uuid, text, jsonb) to authenticated;
