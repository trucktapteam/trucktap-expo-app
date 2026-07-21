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
  v_admin constant uuid := 'a2000000-0000-4000-8000-000000000001';
  v_owner constant uuid := 'a2000000-0000-4000-8000-000000000002';
  v_stranger constant uuid := 'a2000000-0000-4000-8000-000000000004';
  v_truck uuid;
  v_result boolean;
  v_count integer;
  v_stale_policy_count integer;
  v_is_admin_policy_count integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_admin, 'authenticated', 'authenticated', 'auth001-admin@example.test', '', now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'auth001-owner@example.test', '', now(), now()),
    (v_stranger, 'authenticated', 'authenticated', 'auth001-stranger@example.test', '', now(), now());

  update public.profiles set role = 'admin' where id = v_admin;
  update public.profiles set role = 'truck' where id = v_owner;
  update public.profiles set role = 'customer' where id = v_stranger;

  insert into public.trucks (owner_id, name) values (v_owner, 'AUTH-001 Owner Truck')
    returning id into v_truck;

  -- 1. public.is_admin() correctness in isolation. Both request.jwt.claim.sub
  -- and the full request.jwt.claims JSON are set here, matching what a real
  -- PostgREST-authenticated request actually populates (see the
  -- secure_truck_creation.sql note on why a test that only sets one of the
  -- two can pass while the real traffic path is still broken).
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  select public.is_admin() into v_result;
  perform pg_temp.assert_true(v_result = true, 'is_admin() must return true for an admin-role profile');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  select public.is_admin() into v_result;
  perform pg_temp.assert_true(v_result = false, 'is_admin() must return false for a truck-role profile');

  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  select public.is_admin() into v_result;
  perform pg_temp.assert_true(v_result = false, 'is_admin() must return false for a customer-role profile');

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  select public.is_admin() into v_result;
  perform pg_temp.assert_true(v_result = false, 'is_admin() must return false when auth.uid() is null');

  -- 2. anon and authenticated both have execute on is_admin(); several of
  -- the policies it backs apply to anon (e.g. public Discover reads), so
  -- anon must be able to call it too.
  perform pg_temp.assert_true(
    has_function_privilege('anon', 'public.is_admin()', 'execute'),
    'anon must be able to execute is_admin()'
  );
  perform pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.is_admin()', 'execute'),
    'authenticated must be able to execute is_admin()'
  );

  -- 3. trucks: this is the exact regression AUTH-001 was opened for --
  -- "Admins can update any truck" read profiles.role inline, which broke
  -- every authenticated UPDATE on trucks (owner and admin alike) once
  -- authenticated lost table-level SELECT on profiles, because Postgres
  -- must evaluate every permissive policy's qual for a command even when a
  -- different policy would independently grant access. This table has
  -- correct DML grants, so it is exercised live end-to-end here.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.trucks set bio = 'owner update' where id = v_truck;
  perform pg_temp.assert_true(found, 'the owning truck user must still be able to update their own truck');
  reset role;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.trucks set bio = 'admin update' where id = v_truck;
  perform pg_temp.assert_true(found, 'an admin must be able to update a truck they do not own (the AUTH-001 regression)');
  reset role;

  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.trucks set bio = 'stranger update' where id = v_truck;
  perform pg_temp.assert_true(not found, 'an unrelated authenticated user must still be denied (RLS-filtered, not a grant error)');
  reset role;

  -- 4. truck_checkins: table grants are intact here (authenticated has
  -- INSERT, SELECT), so this is exercised live end-to-end too.
  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.truck_checkins (truck_id, user_id) values (v_truck, v_stranger);
  reset role;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.truck_checkins where truck_id = v_truck and user_id = v_stranger;
  perform pg_temp.assert_true(v_count = 1, 'an admin must be able to read checkins for a truck they do not own');
  reset role;

  -- 5. analytics_events: table grants are intact here too (authenticated
  -- has INSERT, SELECT).
  insert into public.analytics_events (truck_id, event_type, event_source)
    values (v_truck, 'view', 'test-fixture');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.analytics_events where truck_id = v_truck;
  perform pg_temp.assert_true(v_count = 1, 'the truck owner must still be able to read analytics events for their own truck');
  reset role;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.analytics_events where truck_id = v_truck;
  perform pg_temp.assert_true(v_count = 1, 'an admin must be able to read analytics events for a truck they do not own');
  reset role;

  -- 6. notification_logs: SELECT-only grant is intact for authenticated.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform count(*) from public.notification_logs;
  reset role;

  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.notification_logs;
  perform pg_temp.assert_true(v_count = 0, 'a non-admin must not be able to read notification_logs');
  reset role;

  -- 7. owner_messages, owner_message_reads, upcoming_stops, review_replies,
  -- and truck_live_events INSERT cannot be exercised live as the
  -- `authenticated` role here: a SEPARATE, unrelated defect (not
  -- introduced or fixed by AUTH-001, and out of scope for it) leaves those
  -- tables without the base table-level SELECT/INSERT/UPDATE/DELETE grants
  -- authenticated (and, for upcoming_stops, anon) needs -- confirmed via
  -- information_schema.role_table_grants and reported separately. Testing
  -- through the `authenticated` role would fail on that missing grant
  -- before ever reaching the policy this migration changed, so it would
  -- not actually test anything about AUTH-001. truck_live_events INSERT is
  -- intentionally client-inaccessible (writes go through the
  -- go_live_truck/go_offline_truck RPCs), so that one omission is by
  -- design, not a bug.
  --
  -- What AUTH-001 controls -- whether a policy's qual/check text still
  -- reads profiles.role directly, versus calling public.is_admin() -- is
  -- fully verifiable from the catalog without going through those broken
  -- grants, so that is what is asserted here instead: zero policies in the
  -- public schema still read profiles.role directly, and all 18 policies
  -- identified in the AUTH-001 audit (analytics_events, notification_logs,
  -- owner_message_reads x2, owner_messages x2, review_replies x4,
  -- truck_checkins, truck_live_events x2, trucks, upcoming_stops x4) now
  -- call public.is_admin().
  select count(*)
  into v_stale_policy_count
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ilike '%profiles%role%'
      or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ilike '%profiles%role%'
    );
  perform pg_temp.assert_true(
    v_stale_policy_count = 0,
    'no RLS policy in the public schema may read profiles.role directly'
  );

  select count(*)
  into v_is_admin_policy_count
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ilike '%is_admin%'
      or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ilike '%is_admin%'
    );
  perform pg_temp.assert_true(
    v_is_admin_policy_count = 18,
    'exactly the 18 policies identified in the AUTH-001 audit must now call public.is_admin()'
  );
end;
$$;

rollback;

\echo 'AUTH-001 profile role RLS dependency tests passed'
