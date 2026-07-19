-- Delete customer accounts in one database transaction. The Edge Function
-- authenticates the caller, then invokes this service-role-only primitive.

create or replace function public.delete_customer_account(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_user_id is null then
    raise exception 'User ID is required'
      using errcode = '22023';
  end if;

  -- Lock the Auth row so ownership cannot race with deletion.
  perform 1
  from auth.users u
  where u.id = p_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'reason', 'user_not_found'
    );
  end if;

  if exists (
    select 1
    from public.trucks t
    where t.owner_id = p_user_id
  ) then
    return jsonb_build_object(
      'success', false,
      'reason', 'owns_truck'
    );
  end if;

  -- Older production schemas may have analytics_events.user_id without a
  -- foreign key. Anonymize it when present; the fixed statement is not
  -- influenced by caller input.
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'analytics_events'
      and c.column_name = 'user_id'
  ) then
    execute
      'update public.analytics_events set user_id = null where user_id = $1'
      using p_user_id;
  end if;

  -- Existing foreign keys cascade or anonymize all supported customer data.
  -- Any restrictive dependency or trigger error aborts this entire function,
  -- including the optional analytics anonymization above.
  delete from auth.users u
  where u.id = p_user_id;

  return jsonb_build_object('success', true);
end;
$$;

comment on function public.delete_customer_account(uuid) is
'Service-only atomic customer account deletion. Truck owners are rejected; database errors roll back all changes.';

revoke all on function public.delete_customer_account(uuid)
from public, anon, authenticated;
grant execute on function public.delete_customer_account(uuid)
to service_role;
