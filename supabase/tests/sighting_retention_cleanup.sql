\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user uuid := 'a8000000-0000-4000-8000-000000000001';
  v_live_id uuid;
  v_grace_id uuid;
  v_purge_id uuid;
begin
  if has_function_privilege('anon', 'public.purge_expired_sightings()', 'execute')
    or has_function_privilege('authenticated', 'public.purge_expired_sightings()', 'execute')
  then
    raise exception 'purge_expired_sightings() must not be callable by anon/authenticated';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_user, 'authenticated', 'authenticated', 'retention-test@example.invalid', '', statement_timestamp(), statement_timestamp());

  -- Still publicly visible.
  insert into public.sightings (truck_name, photo_url, latitude, longitude, expires_at, user_id)
  values ('Live Truck', 'https://example.invalid/truck-images/sightings/live.jpg', 40.0, -105.0, now() + interval '1 hour', v_user)
  returning id into v_live_id;

  -- Expired but still inside the 1-hour grace window: must survive this purge run.
  insert into public.sightings (truck_name, photo_url, latitude, longitude, expires_at, user_id)
  values ('Grace Window Truck', 'https://example.invalid/truck-images/sightings/grace.jpg', 41.0, -106.0, now() - interval '30 minutes', v_user)
  returning id into v_grace_id;

  -- Expired well past the grace window: must be purged.
  insert into public.sightings (truck_name, photo_url, latitude, longitude, expires_at, user_id)
  values ('Old Truck', 'https://example.invalid/truck-images/sightings/old.jpg', 42.0, -107.0, now() - interval '3 hours', v_user)
  returning id into v_purge_id;

  perform public.purge_expired_sightings();

  if not exists (select 1 from public.sightings where id = v_live_id) then
    raise exception 'purge_expired_sightings() deleted a still-live sighting';
  end if;

  if not exists (select 1 from public.sightings where id = v_grace_id) then
    raise exception 'purge_expired_sightings() deleted a sighting still inside its grace window';
  end if;

  if exists (select 1 from public.sightings where id = v_purge_id) then
    raise exception 'purge_expired_sightings() left a sighting past its grace window in place';
  end if;

  -- Running again is a no-op (idempotent) and must not error even with nothing to purge.
  perform public.purge_expired_sightings();
end;
$$;

rollback;
