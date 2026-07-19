-- Prevent authenticated clients from assigning or changing authorization roles.
-- Trusted database maintenance remains possible when there is no end-user JWT.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.guard_profile_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'customer' then
      raise exception 'Authenticated clients cannot assign profile authorization roles'
        using errcode = '42501';
    end if;
  elsif new.role is distinct from old.role then
    raise exception 'Authenticated clients cannot modify profile authorization roles'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.guard_profile_authorization_fields() is
'Rejects authenticated attempts to assign elevated roles or change an existing profile role. Authorization roles are server-managed.';

revoke all on function private.guard_profile_authorization_fields()
from public, anon, authenticated, service_role;

drop trigger if exists guard_profile_authorization_fields on public.profiles;

create trigger guard_profile_authorization_fields
before insert or update of role on public.profiles
for each row
execute function private.guard_profile_authorization_fields();
