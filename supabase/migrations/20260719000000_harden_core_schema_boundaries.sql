-- Forward reconciliation for existing deployments.
--
-- The historical core baseline is already materially present in production
-- and should be recorded as applied rather than replayed. This forward
-- migration carries the intentional least-privilege and signup-function
-- hardening so existing deployments reach the same final state as a fresh
-- bootstrap.

revoke all on table public.trucks from public, anon, authenticated;
grant select on table public.trucks to anon;
grant select, insert, update on table public.trucks to authenticated;
grant all on table public.trucks to service_role;

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

revoke all on table public.favorites from public, anon, authenticated;
grant select, insert, update, delete on table public.favorites to authenticated;
grant all on table public.favorites to service_role;

revoke all on table public.locations from public, anon, authenticated;
grant select on table public.locations to anon;
grant select, insert, update on table public.locations to authenticated;
grant all on table public.locations to service_role;

revoke all on table public.reviews from public, anon, authenticated;
grant select on table public.reviews to anon;
grant select, insert on table public.reviews to authenticated;
grant all on table public.reviews to service_role;

revoke all on table public.sightings from public, anon, authenticated;
grant select, insert on table public.sightings to anon;
grant select, insert, update, delete on table public.sightings to authenticated;
grant all on table public.sightings to service_role;

revoke all on table public.truck_checkins from public, anon, authenticated;
grant select, insert on table public.truck_checkins to authenticated;
grant all on table public.truck_checkins to service_role;

revoke all on table public.analytics_events from public, anon, authenticated;
grant insert on table public.analytics_events to anon;
grant select, insert on table public.analytics_events to authenticated;
grant all on table public.analytics_events to service_role;

revoke all on table public.notification_logs from public, anon, authenticated;
grant select on table public.notification_logs to authenticated;
grant all on table public.notification_logs to service_role;

do $$
declare
  v_sequence regclass;
begin
  select pg_get_serial_sequence(
    'public.analytics_events',
    'id'
  )::regclass into v_sequence;

  if v_sequence is not null then
    execute format(
      'revoke all on sequence %s from public, anon, authenticated',
      v_sequence
    );
    execute format(
      'grant usage on sequence %s to anon, authenticated',
      v_sequence
    );
    execute format(
      'grant all on sequence %s to service_role',
      v_sequence
    );
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (id, email, role, display_name)
  values (
    new.id,
    new.email,
    'customer',
    split_part(new.email, '@', 1)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
'Creates the default customer profile for a newly inserted auth user. Trigger-only; clients cannot execute it directly.';

revoke all on function public.handle_new_user()
from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
