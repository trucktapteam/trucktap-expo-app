-- Keep public attribution fields queryable while preventing unrelated clients
-- from reading account, authorization, ownership, push, or preference data.

revoke select on table public.profiles from anon, authenticated;

grant select (id, display_name, profile_photo)
on table public.profiles
to anon, authenticated;

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
'Returns private profile data only to that profile owner or an authenticated administrator.';

revoke all on function public.get_private_profile(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_private_profile(uuid)
to authenticated;
