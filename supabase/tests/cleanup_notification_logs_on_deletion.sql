\set ON_ERROR_STOP on

begin;

do $$
declare
  v_user uuid := 'a9000000-0000-4000-8000-000000000001';
  v_result jsonb;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_user, 'authenticated', 'authenticated', 'notif-delete-test@example.invalid', '', statement_timestamp(), statement_timestamp());

  insert into public.notification_logs (event_type, user_id, push_token, title, body, status)
  values ('test_event', v_user, 'ExponentPushToken[test-token]', 'Test', 'Body', 'sent');

  set local role service_role;
  select public.delete_customer_account(v_user) into v_result;
  reset role;

  if v_result <> '{"success": true}'::jsonb then
    raise exception 'Deletion returned unexpected result %', v_result;
  end if;

  if not exists (select 1 from public.notification_logs where event_type = 'test_event') then
    raise exception 'notification_logs row was deleted; it should be anonymized and retained';
  end if;

  if exists (
    select 1
    from public.notification_logs
    where event_type = 'test_event'
      and (user_id is not null or push_token is not null)
  ) then
    raise exception 'delete_customer_account did not anonymize notification_logs.user_id / push_token';
  end if;

  if exists (select 1 from auth.users where id = v_user) then
    raise exception 'auth.users row survived account deletion';
  end if;
end;
$$;

rollback;
