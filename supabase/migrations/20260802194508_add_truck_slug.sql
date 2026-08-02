-- Adds a human-readable, unique `slug` to trucks for the new public
-- website's URLs (/truck/{slug}), replacing the current raw-UUID-only
-- addressing. Backfills existing trucks deterministically, including
-- deduping the two real collisions found in production today
-- ("Mericana"/"MERICANA" and "the frozen flamingo"/"The Frozen Flamingo"
-- both normalize to the same slug) — the earlier-created truck in each
-- pair keeps the clean slug, the newer one gets a short id-based suffix.
-- Also installs a BEFORE INSERT trigger so every future truck gets a
-- slug automatically, with the same collision handling, regardless of
-- which path creates it (currently only create_owned_truck(), per
-- 20260721000000_secure_truck_creation.sql, but this doesn't assume that
-- stays the only path).
--
-- No new grant is needed for anon/authenticated to read this column: both
-- already hold a table-level SELECT grant on trucks (confirmed live), and
-- a table-level grant automatically covers columns added afterward.

begin;

alter table public.trucks add column if not exists slug text;

with base as (
  select id, created_at,
    lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')) as base_slug
  from public.trucks
),
ranked as (
  select id, base_slug,
    row_number() over (partition by base_slug order by created_at, id) as rn
  from base
)
update public.trucks t
set slug = case
  when r.base_slug is null or r.base_slug = '' then 'truck-' || substr(t.id::text, 1, 8)
  when r.rn = 1 then r.base_slug
  else r.base_slug || '-' || substr(t.id::text, 1, 6)
end
from ranked r
where r.id = t.id;

alter table public.trucks alter column slug set not null;
alter table public.trucks add constraint trucks_slug_key unique (slug);

create or replace function private.assign_truck_slug()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix int := 0;
begin
  if new.slug is not null and length(btrim(new.slug)) > 0 then
    return new;
  end if;

  v_base := lower(regexp_replace(regexp_replace(trim(coalesce(new.name, '')), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));

  if v_base is null or v_base = '' then
    v_base := 'truck-' || substr(new.id::text, 1, 8);
  end if;

  v_candidate := v_base;
  while exists (select 1 from public.trucks where slug = v_candidate and id <> new.id) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$$;

drop trigger if exists assign_truck_slug on public.trucks;
create trigger assign_truck_slug
  before insert on public.trucks
  for each row execute function private.assign_truck_slug();

commit;
