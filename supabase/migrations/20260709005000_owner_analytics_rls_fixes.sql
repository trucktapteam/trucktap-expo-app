-- Owner Analytics RLS fixes.
--
-- 1. analytics_events: the existing "Allow admins to read analytics" policy
--    is named for admins but its USING clause is the literal boolean `true`,
--    granting every authenticated user read access to every truck's raw
--    analytics events. Replace it with a policy scoped to the truck's owner
--    or a real admin, matching the join-through-trucks pattern already used
--    by review_replies / truck_live_events / owner_messages.
-- 2. favorites: add an owner-read SELECT policy so a truck owner can count
--    favorites for their own truck. The existing self-service policy
--    ("Users can manage their own favorites") is untouched; Postgres unions
--    permissive policies for the same command, so this only widens SELECT.
-- 3. truck_checkins: add an owner-read SELECT policy so a truck owner can
--    count checkins for their own truck. Existing self-service and admin
--    policies are untouched.

drop policy if exists "Allow admins to read analytics" on public.analytics_events;

create policy "Truck owners and admins can read truck analytics events"
on public.analytics_events
for select
using (
  exists (
    select 1
    from public.trucks t
    where t.id = analytics_events.truck_id
      and t.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "Truck owners can read favorites for their truck"
on public.favorites
for select
using (
  exists (
    select 1
    from public.trucks t
    where t.id = favorites.truck_id
      and t.owner_id = auth.uid()
  )
);

create policy "Truck owners can read checkins for their truck"
on public.truck_checkins
for select
using (
  exists (
    select 1
    from public.trucks t
    where t.id = truck_checkins.truck_id
      and t.owner_id = auth.uid()
  )
);
