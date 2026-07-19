\set ON_ERROR_STOP on

begin;

alter table public.analytics_events
  add column if not exists user_id uuid null;

create table public.account_deletion_test_blocker (
  user_id uuid primary key references auth.users(id)
);

do $$
declare
  v_success_user uuid := 'a6000000-0000-4000-8000-000000000001';
  v_blocked_user uuid := 'a6000000-0000-4000-8000-000000000002';
  v_success_event uuid := 'a6000000-0000-4000-8000-000000000003';
  v_blocked_event uuid := 'a6000000-0000-4000-8000-000000000004';
  v_result jsonb;
  v_failed boolean := false;
begin
  if has_function_privilege(
    'anon',
    'public.delete_customer_account(uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.delete_customer_account(uuid)',
    'execute'
  ) then
    raise exception 'Client API role can execute atomic account deletion';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (
      v_success_user,
      'authenticated',
      'authenticated',
      'atomic-delete-success@example.invalid',
      '',
      statement_timestamp(),
      statement_timestamp()
    ),
    (
      v_blocked_user,
      'authenticated',
      'authenticated',
      'atomic-delete-blocked@example.invalid',
      '',
      statement_timestamp(),
      statement_timestamp()
    );

  insert into public.profiles (id, role, display_name)
  values
    (v_success_user, 'customer', 'Delete Success'),
    (v_blocked_user, 'customer', 'Delete Blocked');

  insert into public.analytics_events (id, event_name, user_id)
  values
    (v_success_event, 'atomic-delete-success', v_success_user),
    (v_blocked_event, 'atomic-delete-blocked', v_blocked_user);

  set local role service_role;
  select public.delete_customer_account(v_success_user) into v_result;
  reset role;

  if v_result <> '{"success": true}'::jsonb then
    raise exception 'Successful deletion returned unexpected result %', v_result;
  end if;

  if exists (select 1 from auth.users where id = v_success_user)
    or exists (select 1 from public.profiles where id = v_success_user)
  then
    raise exception 'Successful atomic deletion left account rows behind';
  end if;

  if not exists (
    select 1
    from public.analytics_events
    where id = v_success_event
      and user_id is null
  ) then
    raise exception 'Successful atomic deletion did not anonymize analytics';
  end if;

  insert into public.account_deletion_test_blocker (user_id)
  values (v_blocked_user);

  begin
    set local role service_role;
    perform public.delete_customer_account(v_blocked_user);
    reset role;
  exception
    when foreign_key_violation then
      reset role;
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'Restrictive dependency did not abort account deletion';
  end if;

  if not exists (select 1 from auth.users where id = v_blocked_user)
    or not exists (select 1 from public.profiles where id = v_blocked_user)
    or not exists (
      select 1
      from public.analytics_events
      where id = v_blocked_event
        and user_id = v_blocked_user
    )
  then
    raise exception 'Failed deletion did not roll back every account change';
  end if;
end;
$$;

rollback;
