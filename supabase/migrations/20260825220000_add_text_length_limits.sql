-- Release-critical fix: three user-generated text columns had no upper-bound
-- length limit anywhere (client-side maxLength alone does not stop a caller
-- from hitting the Supabase REST/RPC endpoints directly with the publicly
-- exposed anon/publishable key). Two of the three are reachable with no
-- authentication at all:
--
--   public.sightings.truck_name / public.sightings.notes
--     "Anyone can create sightings" (see
--     20260512184741_fix_sightings_public_insert_policy.sql) grants INSERT to
--     anon as well as authenticated, with no length check of any kind. This is
--     the highest-risk gap: an unauthenticated caller can already submit an
--     arbitrarily large truck_name/notes today.
--
--   public.reviews.text
--     INSERT requires authenticated + auth.uid() = user_id, but still had no
--     length limit, so any account (not just a malicious one) could submit an
--     unbounded review.
--
-- Limits chosen to match the lengths the app's own UI already treats as
-- correct for the same fields elsewhere, so nothing legitimate is newly
-- rejected:
--   - sightings.truck_name: 80, matching the existing client maxLength=80 on
--     the sighting-edit inputs in app/(customer)/(tabs)/discover.tsx and
--     full-map.tsx (the create-sighting screen had no limit at all before
--     this migration's companion client change).
--   - sightings.notes: 280, matching SIGHTING_NOTES_MAX_LENGTH already used
--     by both the create (add-sighting.tsx) and edit (discover.tsx,
--     full-map.tsx) sighting-notes inputs.
--   - reviews.text: 1000, matching the existing client maxLength=1000 already
--     used for the owner's review-reply body (review_replies.body via
--     app/(truck)/reviews.tsx), so a review and its reply share one ceiling.
--
-- Verified read-only against production before writing this migration:
--   public.sightings currently has 0 rows (nothing to conflict with any
--   limit); public.reviews has 28 rows with max(char_length(text)) = 373,
--   comfortably under the 1000 chosen here. No existing data violates any of
--   these constraints.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.sightings'::regclass
      and conname = 'sightings_truck_name_length'
  ) then
    alter table public.sightings
      add constraint sightings_truck_name_length
      check (char_length(truck_name) <= 80);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.sightings'::regclass
      and conname = 'sightings_notes_length'
  ) then
    alter table public.sightings
      add constraint sightings_notes_length
      check (notes is null or char_length(notes) <= 280);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.reviews'::regclass
      and conname = 'reviews_text_length'
  ) then
    alter table public.reviews
      add constraint reviews_text_length
      check (char_length(text) <= 1000);
  end if;
end;
$$;
