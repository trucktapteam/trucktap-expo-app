-- Gates get_private_profile() with the generalized 'private_data'
-- compatibility scope, protecting authenticated profile reads for every
-- role (customer, truck, owner, admin) rather than only owner-management
-- actions. The scope is disabled by default (see
-- 20260720000000_client_compatibility_policy.sql), so this migration alone
-- changes no runtime behavior until an admin enables it after compatible
-- clients are confirmed available in both stores.
--
-- The function body below is a full restatement of
-- get_private_profile(uuid) as created in
-- 20260719010000_restrict_profile_data_exposure.sql. Postgres has no
-- partial-patch DDL for function bodies, so the entire body is repeated;
-- the only change is the single inserted
-- `perform private.require_supported_client(...)` line immediately after
-- the existing authentication check and before the existing authorization
-- check. No other line differs from the original.

create or replace function public.get_private_profile(
  p_profile_id uuid
)
returns table (
  id uuid,
  email text,
  role text,
  created_at timestamptz,
  display_name text,
  profile_photo text,
  push_token text,
  notify_favorites_open boolean,
  notify_new_trucks boolean,
  notify_announcements boolean,
  truck_id uuid,
  last_favorite_notification_at timestamptz,
  notify_owner_favorites boolean,
  notify_owner_reviews boolean,
  notify_hands_free_live_confirmations boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  perform private.require_supported_client('private_data', 'get_private_profile');

  if p_profile_id is distinct from v_actor_id
     and not exists (
       select 1
       from public.profiles as actor
       where actor.id = v_actor_id
         and actor.role = 'admin'
     )
  then
    raise exception 'Not authorized to read this profile'
      using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    profile.email,
    profile.role,
    profile.created_at,
    profile.display_name,
    profile.profile_photo,
    profile.push_token,
    profile.notify_favorites_open,
    profile.notify_new_trucks,
    profile.notify_announcements,
    profile.truck_id,
    profile.last_favorite_notification_at,
    profile.notify_owner_favorites,
    profile.notify_owner_reviews,
    profile.notify_hands_free_live_confirmations
  from public.profiles as profile
  where profile.id = p_profile_id;
end;
$$;

comment on function public.get_private_profile(uuid) is
'Returns private profile data only to that profile owner or an authenticated administrator. Gated by the private_data client compatibility scope.';

revoke all on function public.get_private_profile(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_private_profile(uuid)
to authenticated;
