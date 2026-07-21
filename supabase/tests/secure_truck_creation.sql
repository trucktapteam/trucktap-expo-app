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
  v_customer constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_admin constant uuid := 'e1000000-0000-4000-8000-000000000002';
  v_customer2 constant uuid := 'e1000000-0000-4000-8000-000000000003';
  v_legacy_customer constant uuid := 'e1000000-0000-4000-8000-000000000004';
  v_truck record;
  v_truck2 record;
  v_role text;
  v_rejected boolean;
  v_detail text;
  v_count integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_customer, 'authenticated', 'authenticated', 'ccp-secure-a@example.test', '', now(), now()),
    (v_admin, 'authenticated', 'authenticated', 'ccp-secure-admin@example.test', '', now(), now()),
    (v_customer2, 'authenticated', 'authenticated', 'ccp-secure-b@example.test', '', now(), now()),
    (v_legacy_customer, 'authenticated', 'authenticated', 'ccp-secure-legacy@example.test', '', now(), now());

  -- Role fixtures set with no jwt claim in scope, matching the safe pattern
  -- required by private.guard_profile_authorization_fields (any write to
  -- profiles.role while auth.uid() resolves to a real session is treated as
  -- a self-service change and rejected).
  update public.profiles set role = 'customer' where id in (v_customer, v_customer2, v_legacy_customer);
  update public.profiles set role = 'admin' where id = v_admin;

  -- 1. anon has no execute privilege on the RPC at all.
  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'public.create_owned_truck(text)', 'execute'),
    'anon must not have execute privilege on create_owned_truck'
  );
  perform pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.create_owned_truck(text)', 'execute'),
    'authenticated must have execute privilege on create_owned_truck'
  );

  -- 2. successful creation as an ordinary customer. Both request.jwt.claim.sub
  -- and the full request.jwt.claims JSON are set here, matching what a real
  -- PostgREST-authenticated request actually populates (auth.uid() falls
  -- back to claims->>'sub' when the individual claim is empty) -- a test
  -- that only ever set the individual claim already passed once here while
  -- the RPC's internal role-promotion write was still silently broken
  -- against real traffic, because it never exercised that fallback path.
  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select * into v_truck from public.create_owned_truck('QA RPC Truck');

  perform pg_temp.assert_true(
    v_truck.owner_id = v_customer and v_truck.name = 'QA RPC Truck',
    'the RPC must create a truck owned by the caller with the supplied name'
  );

  -- the function clears request.jwt.claim.sub/claims to get past the
  -- profiles.role guard trigger for its own internal write, then restores
  -- both immediately afterward -- confirm auth.uid() resolves correctly
  -- again in this same transaction/role context right after the call,
  -- rather than staying blinded for whatever runs next.
  perform pg_temp.assert_true(
    auth.uid() = v_customer,
    'auth.uid() must resolve to the real caller again immediately after create_owned_truck returns'
  );

  reset role;
  select role into v_role from public.profiles where id = v_customer;
  perform pg_temp.assert_true(
    v_role = 'truck',
    'role must be promoted from customer to truck atomically with truck creation'
  );

  -- 3. a raw authenticated INSERT into trucks is now rejected outright
  -- (this is the exact CRIT-1 exploit path from the QA report).
  perform set_config('request.jwt.claim.sub', v_customer2::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_customer2::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  v_rejected := false;
  begin
    insert into public.trucks (owner_id, name) values (v_customer2, 'Direct Insert Attempt');
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(
    v_rejected,
    'a raw authenticated INSERT into public.trucks must be rejected (grant revoked, policy removed)'
  );

  -- A customer cannot create a truck for someone else through the RPC
  -- either, because owner_id is never a parameter — verify no row was
  -- created for v_customer2 by the failed direct insert, and that the RPC
  -- itself has exactly one argument.
  select count(*) into v_count from public.trucks where owner_id = v_customer2;
  perform pg_temp.assert_true(v_count = 0, 'the rejected direct insert must not have created a row');
  perform pg_temp.assert_true(
    (select pronargs from pg_proc where proname = 'create_owned_truck' and pronamespace = 'public'::regnamespace) = 1,
    'create_owned_truck must accept only a name; there is no owner_id parameter to assign another user as owner'
  );

  reset role;

  -- 4. anonymous callers cannot execute the RPC.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  set local role anon;

  v_rejected := false;
  begin
    perform public.create_owned_truck('Anon Truck');
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'anon must not be able to execute create_owned_truck');

  reset role;

  -- 5. a null auth.uid() is rejected even under the authenticated role
  -- (defensive: covers a still-authenticated Postgres role with no resolved
  -- JWT subject, distinct from case 4's anon role).
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  set local role authenticated;

  v_rejected := false;
  begin
    perform public.create_owned_truck('No Auth Truck');
  exception
    when sqlstate '28000' then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'a null auth.uid() must be rejected under the authenticated role');

  reset role;

  -- 6. repeated calls: this application supports multiple trucks per owner
  -- (contexts/AppContext.tsx's supabaseOwnedTrucks/getOwnedTrucks/
  -- getUserTruck are all array-shaped with no uniqueness assumption, and
  -- there is no unique constraint on trucks.owner_id) — a second call must
  -- succeed and create an additional distinct truck, not error and not
  -- silently no-op.
  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_customer::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select * into v_truck2 from public.create_owned_truck('QA RPC Truck Two');

  reset role;

  perform pg_temp.assert_true(
    v_truck2.id <> v_truck.id and v_truck2.owner_id = v_customer,
    'a repeat call must create an additional distinct truck for the same owner'
  );
  select count(*) into v_count from public.trucks where owner_id = v_customer;
  perform pg_temp.assert_true(v_count = 2, 'both trucks created for the same owner must persist');
  select role into v_role from public.profiles where id = v_customer;
  perform pg_temp.assert_true(
    v_role = 'truck',
    'role promotion on a repeat call must be a harmless no-op (role is already truck), not an error'
  );

  -- 7. an admin creating a truck through this RPC keeps the admin role;
  -- the promotion only ever fires for role = 'customer'.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  perform public.create_owned_truck('Admin Created Truck');

  reset role;
  select role into v_role from public.profiles where id = v_admin;
  perform pg_temp.assert_true(
    v_role = 'admin',
    'an admin creating a truck through create_owned_truck must not be downgraded to truck'
  );

  -- 8. a blank/whitespace-only name is rejected.
  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  set local role authenticated;

  v_rejected := false;
  begin
    perform public.create_owned_truck('   ');
  exception
    when sqlstate '22023' then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'a blank or whitespace-only truck name must be rejected');

  reset role;

  -- 9. data-consistency repair predicate: a legacy account that already
  -- owns a truck directly (bypassing the RPC, simulating pre-existing
  -- inconsistent data) but is still stored as role = customer must be
  -- identified and fixed by the exact predicate the migration's one-time
  -- repair statement uses; an admin who also owns a truck must never be
  -- touched by it.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  insert into public.trucks (owner_id, name) values (v_legacy_customer, 'Legacy Direct Truck');

  perform pg_temp.assert_true(
    (select role from public.profiles where id = v_legacy_customer) = 'customer',
    'fixture setup: the legacy account must start inconsistent (owns a truck, role still customer)'
  );
  perform pg_temp.assert_true(
    (select role from public.profiles where id = v_admin) = 'admin'
      and exists (select 1 from public.trucks where owner_id = v_admin),
    'fixture check: the admin from case 7 owns a truck too, and must remain excluded by the repair predicate'
  );

  update public.profiles p
  set role = 'truck'
  where p.role = 'customer'
    and exists (select 1 from public.trucks t where t.owner_id = p.id);

  perform pg_temp.assert_true(
    (select role from public.profiles where id = v_legacy_customer) = 'truck',
    'the repair predicate must promote a legacy customer-role truck owner to truck'
  );
  perform pg_temp.assert_true(
    (select role from public.profiles where id = v_admin) = 'admin',
    'the repair predicate must never touch an admin, even one that owns a truck'
  );

  reset role;
end;
$$;

rollback;

\echo 'secure truck creation tests passed'
