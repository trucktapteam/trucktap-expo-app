-- RECONSTRUCTED FOR HISTORICAL RECORD ONLY.
-- This version (20260725235144) is already recorded as applied in
-- production. Do NOT apply this file — it exists to restore the repo's
-- migration history to match what's actually live, not to be re-run.
-- Confidence: HIGH. Recovered verbatim via pg_get_functiondef() against
-- the live database; not the original authored file, but functionally
-- identical to what's currently running.

create or replace function public.admin_get_profiles(p_ids uuid[] default null::uuid[])
returns table(
  id uuid,
  email text,
  role text,
  display_name text,
  profile_photo text,
  created_at timestamp with time zone,
  truck_id uuid,
  has_push_token boolean,
  notify_favorites_open boolean,
  notify_new_trucks boolean,
  notify_announcements boolean,
  notify_owner_favorites boolean,
  notify_owner_reviews boolean,
  notify_hands_free_live_confirmations boolean,
  last_favorite_notification_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.email,
    p.role,
    p.display_name,
    p.profile_photo,
    p.created_at,
    p.truck_id,
    (p.push_token is not null and p.push_token <> ''),
    p.notify_favorites_open,
    p.notify_new_trucks,
    p.notify_announcements,
    p.notify_owner_favorites,
    p.notify_owner_reviews,
    p.notify_hands_free_live_confirmations,
    p.last_favorite_notification_at
  from public.profiles p
  where p_ids is null or p.id = any(p_ids);
end;
$$;

create or replace function public.admin_set_profile_role(p_user_id uuid, p_new_role text)
returns table(id uuid, role text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_current_role text;
  v_admin_count bigint;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required' using errcode = '42501';
  end if;

  if p_new_role is null or p_new_role not in ('customer', 'truck', 'admin') then
    raise exception 'Invalid role: %', coalesce(p_new_role, 'null') using errcode = '22023';
  end if;

  select p.role into v_current_role
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found: %', p_user_id using errcode = '22023';
  end if;

  if v_current_role = 'admin' and p_new_role <> 'admin' then
    select count(*) into v_admin_count from public.profiles where role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last remaining admin'
        using errcode = '42501';
    end if;
  end if;

  perform set_config('trucktap.trusted_role_change', 'on', true);

  update public.profiles p
  set role = p_new_role
  where p.id = p_user_id;

  return query
  select p.id, p.role from public.profiles p where p.id = p_user_id;
end;
$$;

revoke all on function public.admin_get_profiles(uuid[]) from public, anon;
grant execute on function public.admin_get_profiles(uuid[]) to authenticated;

revoke all on function public.admin_set_profile_role(uuid, text) from public, anon;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;
