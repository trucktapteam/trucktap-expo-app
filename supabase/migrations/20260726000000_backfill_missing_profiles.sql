-- Backfill public.profiles rows for any auth.users account that has no
-- corresponding profile. This happens for accounts created before
-- 20260430000000_core_schema_baseline.sql introduced public.profiles and
-- the handle_new_user() signup trigger; those legacy auth.users rows were
-- never retroactively given a profile, so any review (or other
-- profile-joined data) they later created falls back to generic display
-- copy (e.g. "Food Truck Fan") because the join has nothing to resolve.
--
-- Uses the identical derivation handle_new_user() uses for new signups --
-- role = 'customer', display_name = split_part(email, '@', 1) -- so a
-- backfilled row is indistinguishable from one the trigger would have
-- created at signup time. Every other column is left to its table default,
-- exactly as the trigger's insert does.
--
-- Idempotent and non-destructive: only inserts for auth.users ids with no
-- matching public.profiles row (NOT EXISTS), with ON CONFLICT DO NOTHING as
-- a second guard. Never updates or touches an existing public.profiles row.
-- Safe to re-run on any environment (fresh, restored, or already repaired).

insert into public.profiles (id, email, role, display_name)
select
  u.id,
  u.email,
  'customer',
  split_part(u.email, '@', 1)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
