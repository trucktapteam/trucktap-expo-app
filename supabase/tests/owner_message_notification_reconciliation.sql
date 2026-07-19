\set ON_ERROR_STOP on

begin;

do $$
declare
  v_actor uuid := 'a5000000-0000-4000-8000-000000000001';
  v_stale_message uuid := 'a5000000-0000-4000-8000-000000000002';
  v_fresh_message uuid := 'a5000000-0000-4000-8000-000000000003';
  v_now timestamptz := '2026-07-18 16:00:00+00';
  v_reconciled integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values (
    v_actor,
    'authenticated',
    'authenticated',
    'owner-message-reconciliation@example.invalid',
    '',
    v_now,
    v_now
  );

  insert into public.owner_messages (
    id, title, body, target_scope, created_by, created_at
  ) values
    (
      v_stale_message,
      'Stale delivery',
      'Test',
      'all_trucks',
      v_actor,
      v_now - interval '10 minutes'
    ),
    (
      v_fresh_message,
      'Fresh delivery',
      'Test',
      'all_trucks',
      v_actor,
      v_now
    );

  insert into public.owner_message_notification_deliveries (
    message_id, status, claimed_at
  ) values
    (v_stale_message, 'processing', v_now - interval '3 minutes'),
    (v_fresh_message, 'processing', v_now - interval '1 minute');

  select private.reconcile_owner_message_notification_deliveries(v_now)
  into v_reconciled;

  if v_reconciled <> 1 then
    raise exception 'Expected one stale delivery reconciliation, got %',
      v_reconciled;
  end if;

  if not exists (
    select 1
    from public.owner_message_notification_deliveries d
    where d.message_id = v_stale_message
      and d.status = 'failed'
      and d.finished_at = v_now
      and d.failure_count = 1
      and d.error = 'Processing timeout after 2 minutes'
  ) then
    raise exception 'Stale owner-message delivery was not marked failed';
  end if;

  if not exists (
    select 1
    from public.owner_message_notification_deliveries d
    where d.message_id = v_fresh_message
      and d.status = 'processing'
      and d.finished_at is null
  ) then
    raise exception 'Fresh owner-message delivery was incorrectly reconciled';
  end if;

  if has_function_privilege(
    'anon',
    'public.reconcile_owner_message_notification_deliveries()',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.reconcile_owner_message_notification_deliveries()',
    'execute'
  ) then
    raise exception 'Client API role can execute owner-message reconciliation';
  end if;
end;
$$;

rollback;
