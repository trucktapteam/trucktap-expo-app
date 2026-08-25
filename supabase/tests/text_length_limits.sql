\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

-- Regression coverage for
-- supabase/migrations/20260825220000_add_text_length_limits.sql: the three
-- CHECK constraints (sightings.truck_name, sightings.notes, reviews.text)
-- must accept a value exactly at the documented limit and reject one
-- character over it, enforced at the database level regardless of caller
-- role -- including the fully anonymous sighting-creation path, since that
-- is the one reachable with no authentication at all.
do $$
declare
  v_user constant uuid := 'b7000000-0000-4000-8000-000000000001';
  v_truck_id uuid;
  v_rejected boolean;
  v_id uuid;
begin
  -- Note: the anon-role inserts below deliberately do not use `returning`.
  -- anon has no SELECT policy on public.sightings at all (only
  -- get_public_sightings() exposes rows to anon, per
  -- 20260808210000_restrict_sightings_public_access.sql), so a `returning`
  -- clause would itself be blocked by RLS independent of the CHECK
  -- constraints under test here -- and the app's real anon/customer insert
  -- (app/(customer)/add-sighting.tsx) never requests the row back either.
  -- Success is instead confirmed by the insert raising no exception at all.
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_user, 'authenticated', 'authenticated', 'text-limits-reviewer@example.test', '', now(), now());

  -- Truck fixtures must go through create_owned_truck(), not a raw insert:
  -- private.bridge_legacy_truck_creation() (see secure_truck_creation.sql)
  -- rejects any insert into public.trucks with "Authentication required"
  -- unless it happens inside a trusted, authenticated RPC context.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );
  select id into v_truck_id from public.create_owned_truck('Text Limits Test Truck');
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ===========================================================================
  -- sightings.truck_name -- anonymous path (no auth.uid(), matches the
  -- "Anyone can create sightings" policy's `user_id is null` branch, which is
  -- exactly how an unauthenticated caller with only the public anon key can
  -- insert today).
  -- ===========================================================================
  set local role anon;
  perform set_config('request.jwt.claims', '', true);

  -- Exactly 80 characters must be accepted.
  v_rejected := false;
  begin
    insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
    values (repeat('a', 80), 'https://example.invalid/sightings/boundary-name.jpg', 40.0, -105.0, null, now() + interval '1 hour', null);
  exception
    when check_violation then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(not v_rejected, 'anon insert with an 80-char truck_name (the documented limit) must succeed');

  -- 81 characters must be rejected server-side.
  v_rejected := false;
  begin
    insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
    values (repeat('a', 81), 'https://example.invalid/sightings/oversized-name.jpg', 40.0, -105.0, null, now() + interval '1 hour', null);
  exception
    when check_violation then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'an anonymous insert with an 81-char truck_name must be rejected by sightings_truck_name_length');

  -- ===========================================================================
  -- sightings.notes -- same anonymous path.
  -- ===========================================================================

  -- Exactly 280 characters must be accepted.
  v_rejected := false;
  begin
    insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
    values ('Boundary Notes Truck', 'https://example.invalid/sightings/boundary-notes.jpg', 40.0, -105.0, repeat('n', 280), now() + interval '1 hour', null);
  exception
    when check_violation then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(not v_rejected, 'anon insert with 280-char notes (the documented limit) must succeed');

  -- Null notes must still be accepted (the column stays optional).
  v_rejected := false;
  begin
    insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
    values ('Null Notes Truck', 'https://example.invalid/sightings/null-notes.jpg', 40.0, -105.0, null, now() + interval '1 hour', null);
  exception
    when check_violation then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(not v_rejected, 'anon insert with null notes must still succeed');

  -- 281 characters must be rejected server-side.
  v_rejected := false;
  begin
    insert into public.sightings (truck_name, photo_url, latitude, longitude, notes, expires_at, user_id)
    values ('Oversized Notes Truck', 'https://example.invalid/sightings/oversized-notes.jpg', 40.0, -105.0, repeat('n', 281), now() + interval '1 hour', null);
  exception
    when check_violation then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'an anonymous insert with 281-char notes must be rejected by sightings_notes_length');

  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ===========================================================================
  -- reviews.text -- authenticated path (auth.uid() = user_id, the only way
  -- reviews can be inserted at all).
  -- ===========================================================================
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  -- Exactly 1000 characters must be accepted.
  insert into public.reviews (truck_id, user_id, rating, text)
  values (v_truck_id, v_user, 5, repeat('r', 1000))
  returning id into v_id;
  perform pg_temp.assert_true(v_id is not null, 'authenticated insert with 1000-char review text (the documented limit) must succeed');

  -- 1001 characters must be rejected server-side.
  v_rejected := false;
  begin
    insert into public.reviews (truck_id, user_id, rating, text)
    values (v_truck_id, v_user, 5, repeat('r', 1001));
  exception
    when check_violation then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'an authenticated insert with 1001-char review text must be rejected by reviews_text_length');

  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

rollback;
