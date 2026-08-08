\set ON_ERROR_STOP on

begin;

do $$
declare
  v_owner uuid := 'a7000000-0000-4000-8000-000000000001';
  v_other uuid := 'a7000000-0000-4000-8000-000000000002';
  v_live_id uuid;
  v_anon_id uuid;
  v_expired_id uuid;
  v_count int;
  v_row record;
begin
  if has_function_privilege('anon', 'public.get_public_sightings()', 'execute') = false
    or has_function_privilege('authenticated', 'public.get_public_sightings()', 'execute') = false
  then
    raise exception 'get_public_sightings() is not callable by anon/authenticated as intended';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_owner, 'authenticated', 'authenticated', 'sightings-owner@example.invalid', '', statement_timestamp(), statement_timestamp()),
    (v_other, 'authenticated', 'authenticated', 'sightings-other@example.invalid', '', statement_timestamp(), statement_timestamp());

  update public.profiles set display_name = 'Owner Spotter' where id = v_owner;
  update public.profiles set display_name = 'Other User' where id = v_other;

  insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
  values ('Live Truck', 'https://example.invalid/truck-images/sightings/live.jpg', 40.123456, -105.654321, 'live', now() + interval '1 hour', v_owner)
  returning id into v_live_id;

  insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
  values ('Anon Truck', 'https://example.invalid/truck-images/sightings/anon.jpg', 41.0, -106.0, null, now() + interval '1 hour', null)
  returning id into v_anon_id;

  insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
  values ('Expired Truck', 'https://example.invalid/truck-images/sightings/expired.jpg', 39.0, -104.0, null, now() - interval '5 minutes', v_owner)
  returning id into v_expired_id;

  -- Direct table reads: anon must see nothing.
  set local role anon;
  select count(*) into v_count from public.sightings;
  reset role;
  if v_count <> 0 then
    raise exception 'anon direct SELECT on public.sightings returned % rows, expected 0', v_count;
  end if;

  -- Direct table reads: an authenticated user who is not the owner sees nothing.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.sightings;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_count <> 0 then
    raise exception 'non-owner authenticated direct SELECT on public.sightings returned % rows, expected 0', v_count;
  end if;

  -- Direct table reads: the owner sees only their own rows (2: live + expired, not anon's).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.sightings;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_count <> 2 then
    raise exception 'owner direct SELECT on public.sightings returned % rows, expected 2', v_count;
  end if;

  -- get_public_sightings(): anon sees only the two non-expired rows, no user_id column exists,
  -- coordinates are rounded, spotted_by_name is joined, is_own_sighting is false.
  set local role anon;
  select count(*) into v_count from public.get_public_sightings();
  reset role;
  if v_count <> 2 then
    raise exception 'get_public_sightings() returned % rows for anon, expected 2 (expired row must be excluded)', v_count;
  end if;

  set local role anon;
  select * into v_row from public.get_public_sightings() where id = v_live_id;
  reset role;
  if v_row.latitude <> 40.123 or v_row.longitude <> -105.654 then
    raise exception 'get_public_sightings() did not round coordinates to 3 decimal places: got %, %', v_row.latitude, v_row.longitude;
  end if;
  if v_row.spotted_by_name <> 'Owner Spotter' then
    raise exception 'get_public_sightings() spotted_by_name join failed: got %', v_row.spotted_by_name;
  end if;
  if v_row.is_own_sighting <> false then
    raise exception 'get_public_sightings() is_own_sighting should be false for anon caller';
  end if;

  -- get_public_sightings(): the owner sees is_own_sighting = true only for their own row.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select * into v_row from public.get_public_sightings() where id = v_live_id;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_row.is_own_sighting <> true then
    raise exception 'get_public_sightings() is_own_sighting should be true for the sighting owner';
  end if;

  -- Defense in depth: the function's declared return signature never mentions user_id.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_public_sightings'
      and pg_get_function_result(p.oid) ilike '%user_id%'
  ) then
    raise exception 'get_public_sightings() return signature exposes a user_id column';
  end if;
end;
$$;

rollback;
