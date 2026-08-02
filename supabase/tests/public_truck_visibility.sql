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

do $$
declare
  v_owner constant uuid := 'b9000000-0000-4000-8000-000000000001';
  v_admin constant uuid := 'b9000000-0000-4000-8000-000000000002';
  v_public_truck constant uuid := 'b9000000-0000-4000-8000-000000000010';
  v_archived_truck constant uuid := 'b9000000-0000-4000-8000-000000000011';
  v_test_truck constant uuid := 'b9000000-0000-4000-8000-000000000012';
  v_collision_truck_a constant uuid := 'b9000000-0000-4000-8000-000000000020';
  v_collision_truck_b constant uuid := 'b9000000-0000-4000-8000-000000000021';
  v_row_count integer;
  v_select_star_rejected boolean;
  v_column_missing boolean;
  v_slug_a text;
  v_slug_b text;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_owner, 'authenticated', 'authenticated', 'visibility-owner@example.test', '', now(), now()),
    (v_admin, 'authenticated', 'authenticated', 'visibility-admin@example.test', '', now(), now());

  update public.profiles
  set role = case when id = v_admin then 'admin' else 'owner' end
  where id in (v_owner, v_admin);

  insert into public.trucks (
    id, owner_id, name, hero_image, logo, bio, phone,
    is_open, archived, archived_at, is_test
  ) values
    (v_public_truck, v_owner, 'Visible Test Truck', 'https://example.test/hero.jpg',
      'https://example.test/logo.jpg', 'A public test truck.', '(555) 000-0001',
      true, false, null, false),
    (v_archived_truck, v_owner, 'Archived Test Truck', 'https://example.test/hero.jpg',
      'https://example.test/logo.jpg', 'An archived test truck.', '(555) 000-0002',
      false, true, now(), false),
    (v_test_truck, v_owner, 'Internal Test Truck', 'https://example.test/hero.jpg',
      'https://example.test/logo.jpg', 'A QA test truck.', '(555) 000-0003',
      false, false, null, true);

  -- slug: auto-assigned by the assign_truck_slug trigger since none of the
  -- three trucks above specify one. Two more trucks with colliding
  -- normalized names, matching the real collision found in production
  -- ("Mericana"/"MERICANA"), to prove the dedup suffix actually engages.
  insert into public.trucks (id, name, hero_image, logo, is_open)
  values
    (v_collision_truck_a, 'Slug Collision Truck', 'https://example.test/hero.jpg', 'https://example.test/logo.jpg', false),
    (v_collision_truck_b, 'SLUG COLLISION TRUCK', 'https://example.test/hero.jpg', 'https://example.test/logo.jpg', false);

  select slug into v_slug_a from public.trucks where id = v_collision_truck_a;
  select slug into v_slug_b from public.trucks where id = v_collision_truck_b;

  perform pg_temp.assert_true(
    v_slug_a is not null and v_slug_b is not null and v_slug_a <> v_slug_b,
    'trucks with colliding normalized names must still get distinct, non-null slugs'
  );

  perform pg_temp.assert_true(
    (select slug from public.trucks where id = v_public_truck) = 'visible-test-truck',
    'slug must auto-generate deterministically from name when not provided'
  );

  insert into public.locations (truck_id, latitude, longitude, label) values
    (v_public_truck, 30.0, -90.0, 'Public Test Location'),
    (v_archived_truck, 30.1, -90.1, 'Archived Test Location');

  insert into public.reviews (truck_id, user_id, rating, text) values
    (v_public_truck, v_owner, 5, 'Great truck!'),
    (v_archived_truck, v_owner, 4, 'Review on a now-archived truck.');

  -----------------------------------------------------------------------
  -- anon (logged-out customer browsing)
  -----------------------------------------------------------------------
  reset role;
  set local role anon;

  -- 1. a public truck is readable
  select count(*) into v_row_count
  from public.trucks where id = v_public_truck;
  perform pg_temp.assert_true(
    v_row_count = 1, 'anon must be able to read a public-ready truck'
  );

  -- 2. an archived truck is not readable
  select count(*) into v_row_count
  from public.trucks where id = v_archived_truck;
  perform pg_temp.assert_true(
    v_row_count = 0, 'anon must not be able to read an archived truck'
  );

  -- 3. a test truck is not readable
  select count(*) into v_row_count
  from public.trucks where id = v_test_truck;
  perform pg_temp.assert_true(
    v_row_count = 0, 'anon must not be able to read a test truck'
  );

  -- 4. locations for a hidden truck are not readable
  select count(*) into v_row_count
  from public.locations where truck_id = v_archived_truck;
  perform pg_temp.assert_true(
    v_row_count = 0, 'anon must not be able to read locations for an archived truck'
  );

  select count(*) into v_row_count
  from public.locations where truck_id = v_public_truck;
  perform pg_temp.assert_true(
    v_row_count = 1, 'anon must still be able to read locations for a public truck'
  );

  -- 5. reviews for a hidden truck are not readable
  select count(*) into v_row_count
  from public.reviews where truck_id = v_archived_truck;
  perform pg_temp.assert_true(
    v_row_count = 0, 'anon must not be able to read reviews for an archived truck'
  );

  select count(*) into v_row_count
  from public.reviews where truck_id = v_public_truck;
  perform pg_temp.assert_true(
    v_row_count = 1, 'anon must still be able to read reviews for a public truck'
  );

  -- 6. logged-out app browsing still works: the app's fetchAllTrucksFromSupabase
  -- uses `select('*')`. This must NOT raise permission_denied -- if the base
  -- table's anon column grant were restricted, this would fail outright.
  v_select_star_rejected := false;
  begin
    perform * from public.trucks where id = v_public_truck;
  exception
    when insufficient_privilege then
      v_select_star_rejected := true;
  end;
  perform pg_temp.assert_true(
    not v_select_star_rejected,
    'anon select(*) on trucks must keep working for logged-out app browsing'
  );

  -- and every column the app actually reads off a truck row must still be
  -- present for anon (spot-check a representative set, including columns
  -- this migration does not touch at the column-grant level).
  perform pg_temp.assert_true(
    has_column_privilege('anon', 'public.trucks', 'owner_id', 'select')
    and has_column_privilege('anon', 'public.trucks', 'menu_items', 'select')
    and has_column_privilege('anon', 'public.trucks', 'archived', 'select'),
    'this migration must not change trucks column-level grants for anon'
  );

  -- public_trucks view: curated columns, hidden-truck rows excluded
  select count(*) into v_row_count
  from public.public_trucks where id = v_public_truck;
  perform pg_temp.assert_true(
    v_row_count = 1, 'anon must be able to read a public truck via public_trucks'
  );

  perform pg_temp.assert_true(
    (select slug from public.public_trucks where id = v_public_truck) = 'visible-test-truck',
    'public_trucks must expose slug, matching what routing will use'
  );

  select count(*) into v_row_count
  from public.public_trucks where id in (v_archived_truck, v_test_truck);
  perform pg_temp.assert_true(
    v_row_count = 0, 'public_trucks must exclude archived and test trucks'
  );

  v_column_missing := false;
  begin
    perform owner_id from public.public_trucks where id = v_public_truck;
  exception
    when undefined_column then
      v_column_missing := true;
  end;
  perform pg_temp.assert_true(
    v_column_missing, 'public_trucks must not expose owner_id'
  );

  v_column_missing := false;
  begin
    perform archive_reason from public.public_trucks where id = v_public_truck;
  exception
    when undefined_column then
      v_column_missing := true;
  end;
  perform pg_temp.assert_true(
    v_column_missing, 'public_trucks must not expose archive_reason'
  );

  -----------------------------------------------------------------------
  -- owner: must retain full read access to their own trucks, including
  -- the archived and test ones, with every column intact
  -----------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;

  select count(*) into v_row_count
  from public.trucks where owner_id = v_owner;
  perform pg_temp.assert_true(
    v_row_count = 3,
    'the owner must still see all three of their own trucks (public, archived, test)'
  );

  perform pg_temp.assert_true(
    (select archive_reason is not distinct from archive_reason
     from public.trucks where id = v_archived_truck),
    'the owner must retain full-column access to their own archived truck'
  );

  select count(*) into v_row_count
  from public.locations where truck_id = v_archived_truck;
  perform pg_temp.assert_true(
    v_row_count = 1,
    'the owner must still see their own archived truck''s location'
  );

  -----------------------------------------------------------------------
  -- admin: must retain full access to every truck regardless of status
  -----------------------------------------------------------------------
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  select count(*) into v_row_count
  from public.trucks
  where id in (v_public_truck, v_archived_truck, v_test_truck);
  perform pg_temp.assert_true(
    v_row_count = 3, 'an admin must retain full visibility of every truck'
  );

  select count(*) into v_row_count
  from public.reviews where truck_id = v_archived_truck;
  perform pg_temp.assert_true(
    v_row_count = 1, 'an admin must retain visibility of reviews on hidden trucks'
  );

  reset role;
end;
$$;

rollback;

\echo 'public truck visibility restriction tests passed'
