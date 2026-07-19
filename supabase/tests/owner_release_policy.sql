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
  v_customer constant uuid := 'a2000000-0000-4000-8000-000000000003';
  v_truck constant uuid := 'b2000000-0000-4000-8000-000000000001';
  v_policy jsonb;
  v_detail text;
  v_count integer;
  v_seen timestamptz;
begin
  insert into auth.users (id, email)
  values
    (v_admin, 'release-admin@example.test'),
    (v_owner, 'release-owner@example.test'),
    (v_customer, 'release-customer@example.test');

  insert into public.profiles (id, role, display_name)
  values
    (v_admin, 'admin', 'Release Admin'),
    (v_owner, 'truck', 'Release Owner'),
    (v_customer, 'customer', 'Release Customer');

  insert into public.trucks (id, owner_id, name)
  values (v_truck, v_owner, 'Release Policy Truck');

  select to_jsonb(p)
  into v_policy
  from public.get_owner_release_policy() p;

  perform pg_temp.assert_true(
    (v_policy ->> 'owner_gate_enabled')::boolean is false
      and (v_policy ->> 'owner_management_paused')::boolean is false,
    'release enforcement must default disabled'
  );

  perform pg_temp.assert_true(
    not has_function_privilege(
      'anon',
      'public.update_owner_release_policy(boolean,boolean,integer,integer,text,text,text,text,text)',
      'EXECUTE'
    ),
    'anon must not execute the operator policy RPC'
  );

  perform pg_temp.assert_true(
    not has_table_privilege('authenticated', 'private.owner_release_policy', 'SELECT')
      and not has_table_privilege('authenticated', 'private.owner_release_policy_audit', 'SELECT')
      and not has_table_privilege('authenticated', 'private.owner_client_versions', 'SELECT'),
    'normal authenticated users must not read private policy state, audit, or observations'
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"40","x-trucktap-app-version":"1.0.50"}',
    true
  );

  perform public.go_live_truck(
    v_truck, 'manual', 38.2, -85.7, 'Disabled Gate',
    '{"test":"disabled_gate"}'::jsonb
  );
  perform public.go_offline_truck(v_truck, 'manual', '{"test":"disabled_gate"}'::jsonb);

  perform pg_temp.assert_true(
    public.observe_owner_client_version(),
    'authenticated owner observation should be accepted'
  );
  select last_seen_at
  into v_seen
  from private.owner_client_versions
  where user_id = v_owner and platform = 'android';

  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"50","x-trucktap-app-version":"1.1.0"}',
    true
  );
  perform public.observe_owner_client_version();

  perform pg_temp.assert_true(
    (select native_build = 50 and app_version = '1.1.0'
     from private.owner_client_versions
     where user_id = v_owner and platform = 'android')
      and
    (select last_seen_at >= v_seen
     from private.owner_client_versions
     where user_id = v_owner and platform = 'android'),
    'owner observation must upsert one current row per user/platform'
  );

  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  perform pg_temp.assert_true(
    public.observe_owner_client_version() is false,
    'customer observations must not enter owner adoption data'
  );

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  select public.update_owner_release_policy(
    true,
    false,
    50,
    20,
    'https://play.google.com/store/apps/details?id=app.rork.trucktap_food_truck_finder_cqgko70',
    'https://apps.apple.com/us/app/trucktap/id1234567890',
    'TruckTap has been upgraded!',
    'Please install the latest version to manage your truck.',
    'integration activation'
  ) into v_policy;

  perform pg_temp.assert_true(
    (v_policy ->> 'owner_gate_enabled')::boolean,
    'admin update RPC should atomically enable a complete policy'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from private.owner_release_policy_audit
     where actor_user_id = v_admin
       and reason = 'integration activation'),
    'policy update must append immutable actor-attributed history'
  );

  begin
    perform public.update_owner_release_policy(
      true, false, 50, null,
      'https://play.google.com/store/apps/details?id=app.rork.trucktap_food_truck_finder_cqgko70',
      null,
      'Invalid', 'Invalid', 'invalid combination'
    );
    raise exception 'incomplete enabled policy unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;

  perform set_config('request.jwt.claim.sub', v_customer::text, true);
  perform set_config('request.headers', '{}', true);
  update public.profiles
  set display_name = 'Release Customer Updated'
  where id = v_customer;
  perform pg_temp.assert_true(
    (select display_name = 'Release Customer Updated'
     from public.profiles where id = v_customer),
    'owner release enforcement must not block customer profile activity'
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"49","x-trucktap-app-version":"1.0.99"}',
    true
  );

  begin
    perform public.go_live_truck(
      v_truck, 'manual', 38.3, -85.8, 'Old Build',
      '{"test":"old_build"}'::jsonb
    );
    raise exception 'old build unexpectedly went LIVE';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
      perform pg_temp.assert_true(
        v_detail = 'owner_update_required',
        'old build must receive structured update_required detail'
      );
  end;

  perform pg_temp.assert_true(
    (select is_open is false from public.trucks where id = v_truck)
      and not exists (
        select 1 from public.truck_live_events
        where truck_id = v_truck and metadata ->> 'test' = 'old_build'
      ),
    'rejected old Go LIVE must make no truck or audit change'
  );

  begin
    update public.trucks set name = 'Blocked old profile edit' where id = v_truck;
    raise exception 'old owner profile mutation unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
      perform pg_temp.assert_true(
        v_detail = 'owner_update_required',
        'direct old owner management writes must use the same server gate'
      );
  end;

  perform set_config(
    'request.headers',
    '{"x-trucktap-platform":"android","x-trucktap-build":"50","x-trucktap-app-version":"1.1.0"}',
    true
  );
  perform public.go_live_truck(
    v_truck, 'manual', 38.4, -85.9, 'Current Build',
    '{"test":"current_build"}'::jsonb
  );
  perform pg_temp.assert_true(
    (select is_open from public.trucks where id = v_truck),
    'exact minimum build must retain canonical Go LIVE'
  );
  perform public.go_offline_truck(v_truck, 'manual', '{"test":"current_build"}'::jsonb);

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.update_owner_release_policy(
    true,
    true,
    50,
    20,
    'https://play.google.com/store/apps/details?id=app.rork.trucktap_food_truck_finder_cqgko70',
    'https://apps.apple.com/us/app/trucktap/id1234567890',
    'Owner management paused',
    'Truck management is temporarily unavailable.',
    'integration emergency pause'
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  begin
    perform public.go_live_truck(
      v_truck, 'manual', 38.5, -86.0, 'Paused',
      '{"test":"paused"}'::jsonb
    );
    raise exception 'paused owner management unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = pg_exception_detail;
      perform pg_temp.assert_true(
        v_detail = 'owner_management_paused',
        'emergency pause must be distinguishable from update required'
      );
  end;

  -- The operator RPC remains usable during a pause so an admin can recover.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform public.update_owner_release_policy(
    false,
    false,
    null,
    null,
    null,
    null,
    'TruckTap has been upgraded!',
    'Please install the latest version to manage your truck.',
    'integration rollback'
  );

  select count(*) into v_count
  from private.owner_release_policy_audit
  where actor_user_id = v_admin;
  perform pg_temp.assert_true(v_count = 3, 'every successful policy change must be audited');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.headers', '{}', true);
  perform public.go_live_truck(
    v_truck, 'manual', 38.6, -86.1, 'Rolled Back',
    '{"test":"rollback"}'::jsonb
  );
  perform pg_temp.assert_true(
    (select is_open from public.trucks where id = v_truck),
    'disabling enforcement must immediately restore owner operation'
  );
end;
$$;

rollback;
