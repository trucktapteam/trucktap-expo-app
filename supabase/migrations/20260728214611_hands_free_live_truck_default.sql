-- Truck-level Hands-Free LIVE default, with the existing per-stop
-- auto_manage_live flag continuing to serve as the override. No new
-- per-stop schema needed - just a preference read at stop-creation time.
--
-- trucks already uses a whole-table update grant gated by owner RLS
-- ("Owners can update own trucks"), so a new boolean column needs no
-- additional grant migration.

alter table public.trucks
  add column if not exists hands_free_live_default_enabled boolean not null default false;

comment on column public.trucks.hands_free_live_default_enabled is
'Owner preference: pre-fill new stops'' Hands-Free LIVE toggle as on. Purely a client-side default at creation time - has no effect on existing stops and does not itself enable automation for anything.';
