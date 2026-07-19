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
  v_customer_a constant uuid := 'a9000000-0000-4000-8000-000000000001';
  v_customer_b constant uuid := 'a9000000-0000-4000-8000-000000000002';
  v_owner constant uuid := 'a9000000-0000-4000-8000-000000000003';
  v_admin constant uuid := 'a9000000-0000-4000-8000-000000000004';
  v_private_read_rejected boolean;
  v_row_count integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_customer_a, 'authenticated', 'authenticated', 'exposure-a@example.test', '', now(), now()),
    (v_customer_b, 'authenticated', 'authenticated', 'exposure-b@example.test', '', now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'exposure-owner@example.test', '', now(), now()),
    (v_admin, 'authenticated', 'authenticated', 'exposure-admin@example.test', '', now(), now());

  update public.profiles
  set role = case
    when id = v_owner then 'owner'
    when id = v_admin then 'admin'
    else 'customer'
  end,
  push_token = 'masked-test-token',
  truck_id = null
  where id in (v_customer_a, v_customer_b, v_owner, v_admin);

  perform pg_temp.assert_true(
    has_column_privilege('anon', 'public.profiles', 'id', 'select')
    and has_column_privilege('anon', 'public.profiles', 'display_name', 'select')
    and has_column_privilege('anon', 'public.profiles', 'profile_photo', 'select')
    and not has_column_privilege('anon', 'public.profiles', 'email', 'select')
    and not has_column_privilege('anon', 'public.profiles', 'role', 'select')
    and not has_column_privilege('anon', 'public.profiles', 'push_token', 'select')
    and not has_column_privilege('anon', 'public.profiles', 'truck_id', 'select')
    and not has_column_privilege(
      'anon', 'public.profiles', 'notify_favorites_open', 'select'
    ),
    'anon must have SELECT only on public attribution columns'
  );

  perform pg_temp.assert_true(
    has_column_privilege('authenticated', 'public.profiles', 'id', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'profile_photo', 'select')
    and not has_column_privilege('authenticated', 'public.profiles', 'email', 'select')
    and not has_column_privilege('authenticated', 'public.profiles', 'role', 'select')
    and not has_column_privilege('authenticated', 'public.profiles', 'push_token', 'select')
    and not has_column_privilege('authenticated', 'public.profiles', 'truck_id', 'select')
    and not has_column_privilege(
      'authenticated', 'public.profiles', 'notify_announcements', 'select'
    ),
    'authenticated must have SELECT only on public attribution columns'
  );

  perform pg_temp.assert_true(
    not has_function_privilege(
      'anon', 'public.get_private_profile(uuid)', 'execute'
    )
    and has_function_privilege(
      'authenticated', 'public.get_private_profile(uuid)', 'execute'
    )
    and not has_function_privilege(
      'service_role', 'public.get_private_profile(uuid)', 'execute'
    ),
    'private profile RPC execution must be limited to authenticated clients'
  );

  set local role anon;

  select count(*)
  into v_row_count
  from public.profiles
  where id in (v_customer_a, v_customer_b, v_owner, v_admin);

  perform pg_temp.assert_true(
    v_row_count = 4,
    'anon must retain public profile attribution rows'
  );

  v_private_read_rejected := false;
  begin
    perform email from public.profiles where id = v_customer_a;
  exception
    when insufficient_privilege then
      v_private_read_rejected := true;
  end;
  perform pg_temp.assert_true(
    v_private_read_rejected,
    'anon private-column reads must be rejected'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', v_customer_a::text, true);
  set local role authenticated;

  v_private_read_rejected := false;
  begin
    perform role, push_token
    from public.profiles
    where id = v_customer_b;
  exception
    when insufficient_privilege then
      v_private_read_rejected := true;
  end;
  perform pg_temp.assert_true(
    v_private_read_rejected,
    'an authenticated user must not directly read another private profile'
  );

  perform pg_temp.assert_true(
    (
      select p.email = 'exposure-a@example.test'
        and p.role = 'customer'
        and p.push_token = 'masked-test-token'
      from public.get_private_profile(v_customer_a) p
    ),
    'a user must retain private self-read through the authorized RPC'
  );

  v_private_read_rejected := false;
  begin
    perform 1 from public.get_private_profile(v_customer_b);
  exception
    when insufficient_privilege then
      v_private_read_rejected := true;
  end;
  perform pg_temp.assert_true(
    v_private_read_rejected,
    'a user must not use the private RPC for an unrelated profile'
  );

  update public.profiles
  set display_name = 'Customer A Updated'
  where id = v_customer_a;

  perform pg_temp.assert_true(
    (
      select p.display_name = 'Customer A Updated'
      from public.get_private_profile(v_customer_a) p
    ),
    'owner self-update must remain available'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;

  v_private_read_rejected := false;
  begin
    perform email from public.profiles where id = v_customer_b;
  exception
    when insufficient_privilege then
      v_private_read_rejected := true;
  end;
  perform pg_temp.assert_true(
    v_private_read_rejected,
    'owner role must not grant unrelated private profile reads'
  );

  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  perform pg_temp.assert_true(
    (
      select p.email = 'exposure-b@example.test'
        and p.role = 'customer'
      from public.get_private_profile(v_customer_b) p
    ),
    'admin must retain authorized private profile access'
  );

  reset role;
end;
$$;

rollback;

\echo 'profile data exposure tests passed'
