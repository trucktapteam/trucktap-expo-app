-- Fix: truck_saved_locations' RLS policies referenced public.profiles
-- directly (select 1 from public.profiles p where p.id = auth.uid() and
-- p.role = 'admin'), copied from upcoming_stops' *original* migration file.
-- That pattern was already retired schema-wide by
-- 20260722000000_eliminate_profile_role_rls_dependencies.sql in favor of
-- is_admin() (a SECURITY DEFINER wrapper that doesn't require the calling
-- role to hold its own grant on profiles) - upcoming_stops' live policies
-- already use is_admin(), only the historical migration file still shows
-- the old text. Since `authenticated` has no SELECT grant on profiles, any
-- policy referencing it directly fails closed with "permission denied for
-- table profiles" for every authenticated caller, admin or not - table
-- privilege checks happen for every table named in the policy text,
-- regardless of which branch of an OR would short-circuit at runtime. This
-- broke select/insert/update/delete on truck_saved_locations entirely, not
-- just writes - confirmed directly by impersonating an authenticated owner
-- and reproducing the exact error on both an insert and a plain select.

drop policy "Truck owners and admins can create saved locations" on public.truck_saved_locations;
create policy "Truck owners and admins can create saved locations"
on public.truck_saved_locations for insert
with check (is_admin() or exists (select 1 from public.trucks t where t.id = truck_saved_locations.truck_id and t.owner_id = auth.uid()));

drop policy "Truck owners and admins can read saved locations" on public.truck_saved_locations;
create policy "Truck owners and admins can read saved locations"
on public.truck_saved_locations for select
using (is_admin() or exists (select 1 from public.trucks t where t.id = truck_saved_locations.truck_id and t.owner_id = auth.uid()));

drop policy "Truck owners and admins can update saved locations" on public.truck_saved_locations;
create policy "Truck owners and admins can update saved locations"
on public.truck_saved_locations for update
using (is_admin() or exists (select 1 from public.trucks t where t.id = truck_saved_locations.truck_id and t.owner_id = auth.uid()))
with check (is_admin() or exists (select 1 from public.trucks t where t.id = truck_saved_locations.truck_id and t.owner_id = auth.uid()));

drop policy "Truck owners and admins can delete saved locations" on public.truck_saved_locations;
create policy "Truck owners and admins can delete saved locations"
on public.truck_saved_locations for delete
using (is_admin() or exists (select 1 from public.trucks t where t.id = truck_saved_locations.truck_id and t.owner_id = auth.uid()));
