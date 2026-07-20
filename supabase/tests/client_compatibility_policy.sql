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
  v_admin constant uuid := 'c1000000-0000-4000-8000-000000000001';
  v_customer_a constant uuid := 'c1000000-0000-4000-8000-000000000002';
  v_customer_b constant uuid := 'c1000000-0000-4000-8000-000000000003';
  v_owner constant uuid := 'c1000000-0000-4000-8000-000000000004';
  v_owner_policy jsonb;
  v_update_result jsonb;
  v_detail text;
  v_scope_count integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_admin, 'authenticated', 'authenticated', 'ccp-admin@example.test', '', now(), now()),
    (v_customer_a, 'authenticated', 'authenticated', 'ccp-customer-a@example.test', '', now(), now()),
    (v_customer_b, 'authenticated', 'authenticated', 'ccp-customer-b@example.test', '', now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'ccp-owner@example.test', '', now(), now());

  update public.profiles
  set role = case
      when id = v_admin then 'admin'
      when id = v_owner then 'truck'
      else 'customer'
    end
  where id in (v_admin, v_customer_a, v_customer_b, v_owner);

  -- New private tables must be fully locked down, matching the existing
  -- owner_release_policy lockdown pattern exactly.
  perform pg_temp.assert_true(
    not has_table_privilege('anon', 'private.client_compatibility_policy', 'SELECT')
      and not has_table_privilege('authenticated', 'private.client_compatibility_policy', 'SELECT')
      and not has_table_privilege('anon', 'private.client_compatibility_policy_audit', 'SELECT')
      and not has_table_privilege('authenticated', 'private.client_compatibility_policy_audit', 'SELECT'),
    'new compatibility policy tables must not be readable by anon or authenticated'
  );

  perform pg_temp.assert_true(
    not has_function_privilege(
      'authenticated', 'private.require_supported_client(text,text)', 'execute'
    )
    and not has_function_privilege(
      'anon', 'private.require_supported_client(text,text)', 'execute'
    ),
    'require_supported_client must only be callable from within other SECURITY DEFINER functions'
  );

  -- Data migration: the owner_management scope must carry forward whatever
  -- private.owner_release_policy already contains, unchanged.
  select count(*) into v_scope_count from private.client_compatibility_policy;
  perform pg_temp.assert_true(
    v_scope_count = 2,
    'exactly owner_management and private_data scopes must exist after migration'
  );

  select to_jsonb(p) into v_owner_policy
  from public.get_owner_release_policy() p;

  perform pg_temp.assert_true(
    (v_owner_policy ->> 'owner_gate_enabled')::boolean is false,
    'legacy get_owner_release_policy must still return the owner_management scope by its legacy field names'
  );

  -- private_data must be seeded disabled, with no role restriction (applies
  -- to every authenticated role, unlike owner_management).
  perform pg_temp.assert_true(
    (
      select p.enabled is false and p.applies_to_roles is null
      from private.client_compatibility_policy p
      where p.scope = 'private_data'
    ),
    'private_data must be seeded disabled and unrestricted by role'
  );

  -- Generalized read RPC must expose both scopes in one call and be
  -- callable by anon and authenticated, mirroring the legacy RPC's grants.
  perform pg_temp.assert_true(
    has_function_privilege(
      'anon', 'public.get_client_compatibility_policies()', 'execute'
    )
    and has_function_privilege(
      'authenticated', 'public.get_client_compatibility_policies()', 'execute'
    ),
    'get_client_compatibility_policies must be callable by anon and authenticated'
  );

  select count(*) into v_scope_count
  from public.get_client_compatibility_policies();
  perform pg_temp.assert_true(
    v_scope_count = 2,
    'get_client_compatibility_policies must return both scopes'
  );

  -- Disabled state: get_private_profile must work exactly as before this
  -- migration, with no headers set at all.
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config('request.headers', '{}', true);
  set local role authenticated;

  perform pg_temp.assert_true(
    (
      select p.id = v_customer_a
      from public.get_private_profile(v_customer_a) p
    ),
    'private_data disabled must not block a compatible-shaped self read'
  );

  reset role;

  -- Enable private_data with real minimums, mirroring the owner gate's
  -- admin activation RPC but through the generalized function.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  select public.update_client_compatibility_policy(
    'private_data',
    true,
    false,
    50,
    20,
    'https://play.google.com/store/apps/details?id=app.rork.trucktap_food_truck_finder_cqgko70',
    'https://apps.apple.com/us/app/trucktap/id1234567890',
    'TruckTap has been upgraded!',
    'Please install the latest version to view your profile.',
    'integration activation'
  ) into v_update_result;

  perform pg_temp.assert_true(
    (v_update_result ->> 'enabled')::boolean,
    'admin generalized update RPC must atomically enable private_data'
  );

  perform pg_temp.assert_true(
    (
      select count(*) = 1
      from private.client_compatibility_policy_audit
      where actor_user_id = v_admin
        and scope = 'private_data'
        and reason = 'integration activation'
    ),
    'private_data policy changes must be audited exactly like owner_management'
  );

  -- A CUSTOMER, not just an owner/admin, must now be rejected below the
  -- minimum build. This is the core fix: applies_to_roles is null, so every
  -- role is covered, unlike owner_management's role allowlist.
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config('request.headers', '{}', true);
  set local role authenticated;

  v_detail := null;
  begin
    perform 1 from public.get_private_profile(v_customer_a);
    raise exception 'customer with no client headers unexpectedly read private data';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform pg_temp.assert_true(
    v_detail = 'private_data_update_required',
    'missing client headers must be rejected once private_data is enabled, for a customer'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"49","x-trucktap-app-version":"1.0.99"}',
    true
  );
  set local role authenticated;

  v_detail := null;
  begin
    perform 1 from public.get_private_profile(v_customer_a);
    raise exception 'customer below minimum build unexpectedly read private data';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform pg_temp.assert_true(
    v_detail = 'private_data_update_required',
    'below-minimum android build must be rejected for a customer'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"not-a-number"}',
    true
  );
  set local role authenticated;

  v_detail := null;
  begin
    perform 1 from public.get_private_profile(v_customer_a);
    raise exception 'customer with an invalid build header unexpectedly read private data';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform pg_temp.assert_true(
    v_detail = 'private_data_update_required',
    'an invalid (non-numeric) build header must be rejected the same as a missing one'
  );

  -- iOS is evaluated against its own minimum independently of Android:
  -- below the iOS minimum (20) must reject even though the Android minimum
  -- (50) is unrelated, and at/above it must succeed.
  reset role;
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"ios","x-trucktap-build":"19"}',
    true
  );
  set local role authenticated;

  v_detail := null;
  begin
    perform 1 from public.get_private_profile(v_customer_a);
    raise exception 'customer below the iOS minimum unexpectedly read private data';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform pg_temp.assert_true(
    v_detail = 'private_data_update_required',
    'below-minimum iOS build must be rejected independently of the Android minimum'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"ios","x-trucktap-build":"20"}',
    true
  );
  set local role authenticated;

  perform pg_temp.assert_true(
    (
      select p.id = v_customer_a
      from public.get_private_profile(v_customer_a) p
    ),
    'an iOS build at exactly its own minimum must succeed independently of the Android minimum'
  );

  -- Compatible build: self-read succeeds, unrelated-profile read still
  -- fails authorization (not compatibility), admin cross-read still works.
  reset role;
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"50","x-trucktap-app-version":"1.1.0"}',
    true
  );
  set local role authenticated;

  perform pg_temp.assert_true(
    (
      select p.id = v_customer_a
      from public.get_private_profile(v_customer_a) p
    ),
    'a compatible customer build must retain its normal self-read'
  );

  v_detail := null;
  begin
    perform 1 from public.get_private_profile(v_customer_b);
    raise exception 'a compatible but unrelated customer read unexpectedly succeeded';
  exception
    when sqlstate '42501' then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"50","x-trucktap-app-version":"1.1.0"}',
    true
  );
  set local role authenticated;

  perform pg_temp.assert_true(
    (
      select p.id = v_customer_b
      from public.get_private_profile(v_customer_b) p
    ),
    'a compatible admin build must retain authorized cross-profile reads'
  );

  -- Web is exempt from the build comparison even while private_data is
  -- enabled, matching the documented bounded exemption.
  reset role;
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config('request.headers', '{"x-trucktap-platform":"web"}', true);
  set local role authenticated;

  perform pg_temp.assert_true(
    (
      select p.id = v_customer_a
      from public.get_private_profile(v_customer_a) p
    ),
    'web must remain exempt from the private_data build minimum'
  );

  -- Emergency pause must be distinguishable from update_required, exactly
  -- like the owner_management scope's existing behavior.
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.headers', '{}', true);
  perform public.update_client_compatibility_policy(
    'private_data',
    true,
    true,
    50,
    20,
    'https://play.google.com/store/apps/details?id=app.rork.trucktap_food_truck_finder_cqgko70',
    'https://apps.apple.com/us/app/trucktap/id1234567890',
    'Paused',
    'Private data access is temporarily paused.',
    'integration emergency pause'
  );

  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"50"}',
    true
  );
  set local role authenticated;

  v_detail := null;
  begin
    perform 1 from public.get_private_profile(v_customer_a);
    raise exception 'paused private_data scope unexpectedly allowed a read';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform pg_temp.assert_true(
    v_detail = 'private_data_paused',
    'pause must be distinguishable from update_required for private_data'
  );

  -- Roll the scope back to disabled so it cannot leak enforcement into any
  -- later test file run against the same database.
  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.update_client_compatibility_policy(
    'private_data',
    false,
    false,
    null,
    null,
    null,
    null,
    'TruckTap has been upgraded!',
    'Please install the latest version to view your profile and account settings.',
    'integration rollback'
  );

  reset role;
end;
$$;

rollback;

\echo 'client compatibility policy tests passed'
