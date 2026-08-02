-- Restrict public (anon/authenticated) visibility of archived and test
-- trucks, and their locations/reviews, at the row level. Also introduces
-- `public.public_trucks`, a column-curated view for the new public website.
--
-- This migration intentionally does NOT change any column-level grant on
-- the base `public.trucks` table. The existing mobile app fetches trucks
-- with `select('*')` for logged-out (anon-role) browsing
-- (contexts/AppContext.tsx: fetchAllTrucksFromSupabase, called
-- unconditionally on mount, not gated behind auth). Postgres rejects a
-- `SELECT *` in full if the querying role lacks SELECT on even one column
-- of the table -- confirmed empirically against production inside a rolled
-- back transaction before writing this migration:
--
--   revoke select on public.trucks from anon;
--   grant select (id, name, ...) on public.trucks to anon;
--   set local role anon;
--   select * from public.trucks limit 1;
--   -- ERROR: 42501: permission denied for table trucks
--
-- Restricting anon's columns directly on `trucks` today would break the
-- discover screen for every logged-out user, and would break the current
-- website's 404.html fallback query (also `select=*`). That kind of change
-- requires first updating the app to stop requesting `select('*')` for
-- anon-role reads, shipping it, and gating the column restriction behind a
-- client-compatibility minimum version -- the same rollout shape already
-- used for `20260719010000_restrict_profile_data_exposure.sql`. That is a
-- separate, larger initiative and is not part of this migration.
--
-- What this migration actually does:
--   1. Tightens the SELECT policy on trucks/locations/reviews so archived
--      and test trucks (and their locations/reviews) are invisible to
--      everyone except the truck's own owner or an admin. This does not
--      change which columns are visible, only which rows -- so it cannot
--      break a `select('*')` caller, it can only change row counts, which
--      is the intended fix (hidden trucks stop being returned at all).
--   2. Adds `public.public_trucks`, a new, additive, column-curated view
--      containing only public-website-appropriate columns. The base
--      table's grants are untouched, so this view is purely additive --
--      it changes nothing about what the existing app or existing website
--      can already do. Only the new public website is meant to query this
--      view going forward, instead of the base `trucks` table.

begin;

-- ── trucks: row-level only ──────────────────────────────────────────
drop policy if exists "Public read trucks" on public.trucks;

create policy "Public read trucks"
  on public.trucks
  for select
  to anon, authenticated
  using (
    (
      coalesce(archived, false) = false
      and archived_at is null
      and coalesce(is_test, false) = false
    )
    or auth.uid() = owner_id
    or is_admin()
  );

-- ── locations: row-level only, joined to trucks visibility ─────────
drop policy if exists "Public read locations" on public.locations;

create policy "Public read locations"
  on public.locations
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.trucks t
      where t.id = locations.truck_id
        and (
          (
            coalesce(t.archived, false) = false
            and t.archived_at is null
            and coalesce(t.is_test, false) = false
          )
          or auth.uid() = t.owner_id
          or is_admin()
        )
    )
  );

-- ── reviews: row-level only, joined to trucks visibility ────────────
-- reviews.user_id is intentionally left readable: it is required to join
-- to public.profiles(id, display_name, profile_photo) for reviewer
-- attribution, and those are already the only columns anon can read on
-- profiles (see 20260719010000_restrict_profile_data_exposure.sql).
drop policy if exists "Anyone can read reviews" on public.reviews;

create policy "Anyone can read reviews"
  on public.reviews
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.trucks t
      where t.id = reviews.truck_id
        and (
          (
            coalesce(t.archived, false) = false
            and t.archived_at is null
            and coalesce(t.is_test, false) = false
          )
          or auth.uid() = t.owner_id
          or is_admin()
        )
    )
  );

-- ── public_trucks: new, column-curated view for the public website ──
-- security_invoker makes this view evaluate with the querying role's own
-- privileges and RLS, not the view owner's -- required so it can never
-- silently bypass the row-level policy above, now or after a future
-- change to the base table's policies. The WHERE clause below is also
-- explicit and redundant with the base policy on purpose, as defense in
-- depth for this specific view's contract.
--
-- Excluded on purpose: owner_id, is_test, archived, archived_at,
-- archive_reason, is_disabled, live_source, live_stop_id,
-- hands_free_live_default_enabled (internal/operational, no legitimate
-- public use), plus the dead/legacy columns image_url, latitude, longitude
-- (always null today; real geography lives in public.locations).
--
-- `slug` requires 20260801000000_add_truck_slug.sql to have run first.
create or replace view public.public_trucks
  with (security_invoker = true)
as
  select
    id,
    slug,
    name,
    cuisine_type,
    description,
    bio,
    phone,
    website,
    hero_image,
    logo,
    gallery_images,
    menu_images,
    menu_items,
    announcements,
    is_verified,
    is_open,
    service_area,
    facebook_url,
    instagram_url,
    tiktok_url,
    trust_badges,
    last_live_updated_at,
    live_started_at,
    live_expires_at,
    created_at,
    updated_at
  from public.trucks
  where coalesce(archived, false) = false
    and archived_at is null
    and coalesce(is_test, false) = false;

grant select on public.public_trucks to anon, authenticated;

commit;
