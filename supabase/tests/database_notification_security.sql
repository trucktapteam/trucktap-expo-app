\set ON_ERROR_STOP on

begin;

do $$
declare
  v_function regprocedure;
begin
  v_function := to_regprocedure(
    'private.notify_database_notification_webhook()'
  );
  if v_function is null then
    raise exception 'Secure database notification helper is missing';
  end if;

  if has_function_privilege(
    'anon',
    v_function,
    'execute'
  ) or has_function_privilege(
    'authenticated',
    v_function,
    'execute'
  ) or has_function_privilege(
    'service_role',
    v_function,
    'execute'
  ) then
    raise exception 'Database notification helper is client-executable';
  end if;

  if to_regprocedure('public.notify_new_favorite_webhook()') is not null
    or to_regprocedure('public.notify_new_review_webhook()') is not null
    or to_regprocedure('public.notify_new_truck_webhook()') is not null
  then
    raise exception 'Legacy unauthenticated public webhook helper remains';
  end if;

  if (
    select count(*)
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where not t.tgisinternal
      and t.tgname in (
        'notify_new_favorite_on_insert',
        'notify_new_review_on_insert',
        'notify_new_truck_on_insert'
      )
      and n.nspname = 'private'
      and p.proname = 'notify_database_notification_webhook'
  ) <> 3 then
    raise exception 'Not every database notification trigger uses the secure helper';
  end if;
end;
$$;

rollback;
