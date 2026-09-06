-- AUTH: give admins row-level read access to public.favorites.
--
-- public.favorites has only two SELECT policies today:
--   "Users can manage their own favorites"           (auth.uid() = user_id)
--   "Truck owners can read favorites for their truck" (trucks.owner_id = auth.uid())
--
-- 20260722000000_eliminate_profile_role_rls_dependencies.sql added an
-- is_admin() read path to analytics_events, notification_logs,
-- owner_message_reads, owner_messages, review_replies, truck_checkins,
-- truck_live_events, trucks, and upcoming_stops -- but not favorites. As a
-- result the TruckTap admin console (which authenticates with the anon key
-- as a profiles.role = 'admin' user, and owns no trucks) reads back only
-- its own favorites. Every "Favorites" count it renders on the truck list,
-- truck detail, user list, and user detail screens silently resolves to 0.
-- RLS filtering does not raise, so the wrong value is displayed rather than
-- an error surfaced.
--
-- Fix: a single additional PERMISSIVE SELECT policy scoped to authenticated
-- callers for whom public.is_admin() is true. This mirrors the pattern used
-- for every other admin-readable table listed above. The two existing
-- policies are untouched.
--
-- This is purely additive. PostgreSQL combines multiple permissive policies
-- for the same command with OR, so this policy can only widen the set of
-- rows a caller may read, never narrow it. A non-admin caller's access is
-- unchanged because is_admin() is false for them and the new policy
-- contributes nothing. No table-level grant is changed: authenticated
-- already holds SELECT on public.favorites
-- (20260719000000_harden_core_schema_boundaries.sql).

drop policy if exists "Admins can read all favorites" on public.favorites;

create policy "Admins can read all favorites"
on public.favorites
for select
to authenticated
using (public.is_admin());
