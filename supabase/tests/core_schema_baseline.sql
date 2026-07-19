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

-- Reapplying the baseline must not duplicate tables, constraints, policies,
-- indexes, functions, or the auth trigger. Reapply its forward reconciliations
-- too, because the baseline intentionally records the historical production
-- grants before later hardening.
\ir ../migrations/20260430000000_core_schema_baseline.sql
\ir ../migrations/20260719000000_harden_core_schema_boundaries.sql
\ir ../migrations/20260719010000_restrict_profile_data_exposure.sql

do $$
declare
  v_user_a constant uuid := 'a8000000-0000-4000-8000-000000000001';
  v_user_b constant uuid := 'a8000000-0000-4000-8000-000000000002';
  v_email_a constant text := 'baseline-a@example.test';
  v_email_b constant text := 'baseline-b@example.test';
  v_count integer;
begin
  select count(*)
  into v_count
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'auth.users'::regclass
    and t.tgname = 'on_auth_user_created'
    and not t.tgisinternal;

  perform pg_temp.assert_true(
    v_count = 1,
    'on_auth_user_created must exist exactly once'
  );

  perform pg_temp.assert_true(
    (
      select p.prosecdef
        and p.proconfig = array['search_path=pg_catalog']::text[]
      from pg_catalog.pg_proc p
      where p.oid = 'public.handle_new_user()'::regprocedure
    ),
    'handle_new_user must be SECURITY DEFINER with pinned search_path'
  );

  perform pg_temp.assert_true(
    not has_function_privilege(
      'anon',
      'public.handle_new_user()',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.handle_new_user()',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.handle_new_user()',
      'execute'
    ),
    'handle_new_user must be trigger-only'
  );

  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (
      v_user_a,
      'authenticated',
      'authenticated',
      v_email_a,
      '',
      statement_timestamp(),
      statement_timestamp()
    ),
    (
      v_user_b,
      'authenticated',
      'authenticated',
      v_email_b,
      '',
      statement_timestamp(),
      statement_timestamp()
    );

  perform pg_temp.assert_true(
    (
      select count(*) = 2
      from public.profiles
      where id in (v_user_a, v_user_b)
        and role = 'customer'
        and (
          (id = v_user_a and email = v_email_a and display_name = 'baseline-a')
          or
          (id = v_user_b and email = v_email_b and display_name = 'baseline-b')
        )
    ),
    'auth signup must create the existing default customer profile'
  );

  perform pg_temp.assert_true(
    (
      select count(*) = 3
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname in (
          'Public can read basic profile info',
          'Users can read own profile',
          'Users can update own profile'
        )
    ),
    'the three production profile policies must exist exactly once'
  );

  perform pg_temp.assert_true(
    (
      select count(*) = 3
      from pg_catalog.pg_constraint
      where conrelid = 'public.profiles'::regclass
        and conname in (
          'profiles_pkey',
          'profiles_email_key',
          'profiles_id_fkey'
        )
    ),
    'profile primary, unique-email, and auth-user constraints must exist'
  );

  perform pg_temp.assert_true(
    (
      select count(*) = 2
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'profiles'
        and indexname in ('profiles_pkey', 'profiles_email_key')
    ),
    'profile primary-key and unique-email indexes must exist exactly once'
  );

  perform pg_temp.assert_true(
    not has_table_privilege('anon', 'public.profiles', 'select')
    and has_column_privilege('anon', 'public.profiles', 'id', 'select')
    and has_column_privilege('anon', 'public.profiles', 'display_name', 'select')
    and has_column_privilege('anon', 'public.profiles', 'profile_photo', 'select')
    and not has_column_privilege('anon', 'public.profiles', 'email', 'select')
    and not has_table_privilege('anon', 'public.profiles', 'insert')
    and not has_table_privilege('anon', 'public.profiles', 'update')
    and not has_table_privilege('anon', 'public.profiles', 'delete')
    and not has_table_privilege('authenticated', 'public.profiles', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'id', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'profile_photo', 'select')
    and not has_column_privilege('authenticated', 'public.profiles', 'email', 'select')
    and has_table_privilege('authenticated', 'public.profiles', 'update')
    and not has_table_privilege('authenticated', 'public.profiles', 'insert')
    and not has_table_privilege('authenticated', 'public.profiles', 'delete')
    and not has_table_privilege('authenticated', 'public.profiles', 'truncate')
    and not has_table_privilege('authenticated', 'public.profiles', 'references')
    and not has_table_privilege('authenticated', 'public.profiles', 'trigger'),
    'profile grants must expose only public display columns and self-update'
  );

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;

  update public.profiles
  set display_name = 'Updated A'
  where id = v_user_a;

  perform pg_temp.assert_true(
    (
      select display_name = 'Updated A'
      from public.profiles
      where id = v_user_a
    ),
    'authenticated users must retain normal self-profile updates'
  );

  update public.profiles
  set display_name = 'Illicit B'
  where id = v_user_b;

  perform pg_temp.assert_true(
    (
      select display_name = 'baseline-b'
      from public.profiles
      where id = v_user_b
    ),
    'authenticated users must not update another profile'
  );

  reset role;
end;
$$;

rollback;

\echo 'core schema baseline tests passed'
