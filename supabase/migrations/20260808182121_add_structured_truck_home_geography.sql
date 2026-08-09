-- History-alignment file only. This migration was already applied directly to
-- production (via the Supabase dashboard, by trucktapteam@gmail.com, recorded in
-- supabase_migrations.schema_migrations as version 20260808182121) outside this
-- repo's tracked migration workflow. This file reproduces that exact recorded SQL
-- verbatim so local migration history matches production and `supabase db push`
-- stops treating it as missing. It has not been re-run against production.

alter table public.trucks
  add column if not exists home_city text,
  add column if not exists home_state text,
  add column if not exists home_city_slug text,
  add column if not exists home_state_slug text;

create index if not exists trucks_home_state_slug_idx
  on public.trucks (home_state_slug);

create index if not exists trucks_home_city_slug_idx
  on public.trucks (home_city_slug);

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
  updated_at,
  home_city,
  home_state,
  home_city_slug,
  home_state_slug
from public.trucks
where coalesce(archived, false) = false
  and archived_at is null
  and coalesce(is_test, false) = false;
