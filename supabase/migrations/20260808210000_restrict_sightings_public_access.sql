-- Sightings previously had an unconditional public-read RLS policy, exposing each
-- row's raw user_id and exact (double-precision) latitude/longitude to anyone via
-- direct table reads. Lock the base table down to the sighting's own author or an
-- admin, and serve the public feed exclusively through a SECURITY DEFINER function
-- that projects only a sanitized, fixed column set.
--
-- Why a plain view (security_invoker) cannot do this: anon/authenticated do not have
-- rolbypassrls, so a security_invoker view would be subject to the same locked-down
-- RLS policy below and would return nothing to other users. This function instead
-- follows the same ownership-bypass-RLS pattern already used by
-- public.delete_customer_account: it is owned by postgres (rolbypassrls = true) and
-- declared SECURITY DEFINER, so it alone can see all non-expired rows, while the base
-- table remains inaccessible to anon/authenticated outside of their own rows. Its SQL
-- is fixed (no dynamic SQL, no caller-supplied column/filter list), so callers cannot
-- widen the projection to reach user_id or full-precision coordinates.
--
-- Production has since drifted from what this migration originally assumed: six
-- policies (sightings_admin_select_all, sightings_admin_update_delete,
-- sightings_admin_update_delete_del, sightings_authenticated_insert,
-- sightings_public_select_not_expired, plus the original "Public can read sightings")
-- were added directly through the Supabase dashboard, outside this repo's tracked
-- migrations -- none appear in git history or supabase_migrations.schema_migrations.
-- Reconciling each against the intended final model:
--
--   "Public can read sightings" (SELECT, qual: true, role public)
--     -> STALE. The original leak. Drop; superseded by the combined policy below.
--   sightings_admin_select_all (SELECT, admin-only, role authenticated)
--     -> OVERLAPPING. Folded into the combined "Owner or admin can read sightings"
--        policy below. Also used an inline `profiles.role = 'admin'` check, which
--        is exactly what the AUTH-001 migration eliminated elsewhere in this schema
--        (see supabase/tests/auth001_eliminate_profile_role_rls_dependencies.sql) --
--        drop and replace with public.is_admin() throughout.
--   sightings_public_select_not_expired (SELECT, qual: expires_at > now(), roles
--   anon+authenticated)
--     -> STALE AND DANGEROUS. This is an unfiltered read of every non-expired row's
--        raw user_id and full-precision coordinates for any anon/authenticated
--        caller -- functionally the same leak as "Public can read sightings", just
--        narrower by expiry. Drop; this is precisely the access get_public_sightings()
--        replaces.
--   sightings_authenticated_insert (INSERT, role authenticated, check: true)
--     -> STALE AND UNSAFE, drop. No user_id constraint at all: any authenticated
--        caller could insert a sighting under another user's user_id. The existing
--        "Anyone can create sightings" policy (kept, untouched) already correctly
--        requires user_id is null or auth.uid() = user_id.
--   sightings_admin_update_delete / sightings_admin_update_delete_del (UPDATE/DELETE,
--   admin-only, role authenticated)
--     -> OVERLAPPING but load-bearing: TruckTap-admin/expo's app/sightings.tsx
--        moderation screen does an unfiltered `.from('sightings').select('*')` and
--        updates/deletes by id alone (no user_id filter), and cannot function
--        without admin-wide SELECT/UPDATE/DELETE. Drop the inline-role-check
--        versions and recreate equivalently using public.is_admin(), for the same
--        AUTH-001 reason as above.
--   "Anyone can create sightings" / "Users can update own sightings" / "Users can
--   delete own sightings" (original, own-row policies)
--     -> CORRECT. Untouched.
--
-- All drops are idempotent (`if exists`) so this applies cleanly regardless of which
-- subset of the drifted policies is present at deploy time.

drop policy if exists "Public can read sightings" on public.sightings;
drop policy if exists "sightings_admin_select_all" on public.sightings;
drop policy if exists "sightings_public_select_not_expired" on public.sightings;
drop policy if exists "sightings_authenticated_insert" on public.sightings;
drop policy if exists "sightings_admin_update_delete" on public.sightings;
drop policy if exists "sightings_admin_update_delete_del" on public.sightings;

drop policy if exists "Owner or admin can read sightings" on public.sightings;
create policy "Owner or admin can read sightings"
  on public.sightings
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admins can update any sighting" on public.sightings;
create policy "Admins can update any sighting"
  on public.sightings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete any sighting" on public.sightings;
create policy "Admins can delete any sighting"
  on public.sightings
  for delete
  to authenticated
  using (public.is_admin());

create or replace function public.get_public_sightings()
returns table (
  id uuid,
  truck_name text,
  photo_url text,
  notes text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz,
  expires_at timestamptz,
  spotted_by_name text,
  is_own_sighting boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.truck_name,
    s.photo_url,
    s.notes,
    round(s.latitude::numeric, 3)::double precision as latitude,
    round(s.longitude::numeric, 3)::double precision as longitude,
    s.created_at,
    s.expires_at,
    p.display_name as spotted_by_name,
    coalesce(auth.uid() = s.user_id, false) as is_own_sighting
  from public.sightings s
  left join public.profiles p on p.id = s.user_id
  where s.expires_at > now();
$$;

revoke all on function public.get_public_sightings() from public;
grant execute on function public.get_public_sightings() to anon, authenticated;

comment on function public.get_public_sightings() is
  'Public-safe sightings feed: excludes raw user_id, rounds coordinates to 3 decimal places (~111m), excludes expired rows. SECURITY DEFINER bypasses the owner/admin-only RLS on public.sightings by design — see migration comment.';
