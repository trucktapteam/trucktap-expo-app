-- Closes CRIT-1 from the TruckTap 2.0 automated QA report: any authenticated
-- customer could INSERT directly into public.trucks (RLS only checked
-- auth.uid() = owner_id, with no role gate), then immediately exercise full
-- owner capability (go_live_truck, menu edits, ...) via the ownership-based
-- (not role-based) isOwner check in contexts/AppContext.tsx. profiles.role
-- was never touched by that path, so the account stayed 'customer' in the
-- database while behaving as a fully-privileged owner client-side.
--
-- Replaces the raw INSERT used by the "I have a truck" onboarding flow
-- (app/truck-setup.tsx) with a narrow SECURITY DEFINER RPC that creates the
-- truck and promotes the caller's role in one transaction, then removes the
-- client's ability to INSERT into trucks directly at all.
--
-- Preserves the exact current onboarding defaults (see app/truck-setup.tsx's
-- insertPayload prior to this migration) and current admin behavior: admins
-- already skip the client-side role assignment when creating a truck via
-- this screen, so this RPC only ever promotes an existing 'customer' role to
-- 'truck' and never touches 'admin' (or any other role) — admins remain
-- admins if they use this same flow.

create or replace function public.create_owned_truck(
  p_name text
)
returns public.trucks
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_truck public.trucks;
  v_saved_claim_sub text := current_setting('request.jwt.claim.sub', true);
  v_saved_claims text := current_setting('request.jwt.claims', true);
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'Truck name is required' using errcode = '22023';
  end if;

  -- owner_id is never a parameter: the caller cannot assign another user as
  -- owner because there is no input through which to express one.
  insert into public.trucks (
    owner_id,
    name,
    hero_image,
    logo,
    cuisine_type,
    bio,
    is_open,
    phone,
    website,
    facebook_url,
    instagram_url,
    tiktok_url,
    service_area,
    trust_badges,
    is_verified
  ) values (
    v_actor_id,
    v_name,
    'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=800',
    'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=200',
    'Unspecified',
    '',
    false,
    '',
    '',
    '',
    '',
    '',
    '',
    '[]'::jsonb,
    false
  )
  returning * into v_truck;

  -- Promote 'customer' to 'truck' only. An admin (or any other existing
  -- role) creating a truck through this same flow keeps their role
  -- unchanged, matching the client's pre-existing
  -- `if (currentUser?.role === 'admin') { skip role override }` behavior.
  -- A repeat call from an existing truck owner is a no-op here (role is
  -- already 'truck', not 'customer') and still creates an additional truck
  -- row — see the migration header note on multi-truck support.
  --
  -- private.guard_profile_authorization_fields() (20260718030000) rejects
  -- any profiles.role write made while auth.uid() resolves to a real
  -- session, treating it as a self-service change -- indistinguishable
  -- from the exact self-promotion attack it exists to stop. SECURITY
  -- DEFINER does not change what auth.uid() sees, since it reads
  -- session/transaction GUCs, not the executing role, so without this the
  -- guard would block this function's own legitimate write. v_actor_id was
  -- already captured above from the real auth.uid(), and every prior
  -- authorization decision in this function is already final by this
  -- point, so clearing the claim here only affects this one trusted write.
  --
  -- TRACKED FOLLOW-UP (not done here): private.guard_truck_live_state()
  -- already establishes a better precedent for this codebase -- a
  -- transaction-local marker GUC plus a current_user check against a
  -- specific trusted function owner, instead of blinding auth.uid().
  -- Teaching guard_profile_authorization_fields() that same pattern would
  -- remove the need to touch auth.uid() here at all, but that means editing
  -- a different, pre-existing migration/trigger, which is out of scope for
  -- this change.
  --
  -- auth.uid() reads request.jwt.claim.sub first and falls back to the
  -- 'sub' key of the full request.jwt.claims JSON blob if that is empty.
  -- A live PostgREST-authenticated request populates both; clearing only
  -- request.jwt.claim.sub still leaves auth.uid() resolving through the
  -- claims-JSON fallback, so both must be cleared.
  --
  -- Both GUCs are restored immediately after this one write, rather than
  -- left cleared for the rest of the transaction. set_config(..., true) is
  -- already transaction-local (equivalent to SET LOCAL) so nothing leaks
  -- across requests or pooled connections either way, but restoring here
  -- keeps the blind spot scoped to exactly this statement -- if this
  -- function is ever extended to do more work after the role promotion,
  -- that code still sees the real caller instead of silently inheriting a
  -- null auth.uid().
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  update public.profiles
  set role = 'truck'
  where id = v_actor_id
    and role = 'customer';

  perform set_config('request.jwt.claim.sub', coalesce(v_saved_claim_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_saved_claims, ''), true);

  return v_truck;
end;
$$;

comment on function public.create_owned_truck(text) is
'Creates a truck owned by the calling user and promotes their profile role from customer to truck, atomically. Used exclusively by the "I have a truck" onboarding flow (app/truck-setup.tsx).';

revoke all on function public.create_owned_truck(text)
from public, anon, authenticated;
grant execute on function public.create_owned_truck(text)
to authenticated;

-- Direct client-side truck creation is no longer permitted. The RLS INSERT
-- policy only ever checked auth.uid() = owner_id (no role gate) — that was
-- the entire vulnerability. Table-level INSERT grant is revoked too, as
-- defense in depth: even a future permissive policy would still need an
-- explicit re-grant to matter. SELECT and UPDATE grants, and the "Owners can
-- update own trucks" / "Admins can update any truck" / "Public read trucks"
-- policies, are untouched — existing read/update functionality for owners,
-- admins, and public/anon Discover browsing is unaffected.
drop policy if exists "Owners can insert own trucks" on public.trucks;

revoke insert on table public.trucks from authenticated;

-- create_owned_truck's internal INSERT is unaffected by the revoke above:
-- SECURITY DEFINER functions execute their body with the privileges of the
-- function owner (the migration-applying role), not the calling client's
-- role, exactly like get_private_profile and go_live_truck already do for
-- their own trusted internal operations.

-- Data-consistency repair: promote any account that already owns at least
-- one truck but is still stored as 'customer' (the exact condition this
-- migration closes). Scoped tightly — only role = 'customer' rows are
-- touched; admins and any other existing role are never modified.
update public.profiles p
set role = 'truck'
where p.role = 'customer'
  and exists (
    select 1
    from public.trucks t
    where t.owner_id = p.id
  );
