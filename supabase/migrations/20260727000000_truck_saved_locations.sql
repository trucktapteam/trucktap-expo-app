-- Saved Locations: owner-curated, reusable stop addresses with cached
-- geocoding, so a stop's address/coordinates don't need to be re-resolved
-- every time the same spot is used. Deliberately scoped to location
-- identity only (no recurrence/scheduling fields) so a future recurring-
-- schedule feature can reference a saved location by id without needing a
-- redesign of this table.
--
-- Distinct from the pre-existing public.locations table (one row per
-- truck, current map pin) - this is a per-truck list of many reusable
-- addresses.

create table if not exists public.truck_saved_locations (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete cascade,
  label text not null,
  location_text text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(label)) > 0),
  check (length(btrim(location_text)) > 0),
  constraint truck_saved_locations_label_unique unique (truck_id, label)
);

create index if not exists truck_saved_locations_truck_id_idx
  on public.truck_saved_locations(truck_id);

alter table public.truck_saved_locations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'truck_saved_locations'
      and policyname = 'Truck owners and admins can read saved locations'
  ) then
    create policy "Truck owners and admins can read saved locations"
    on public.truck_saved_locations
    for select
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      or exists (
        select 1
        from public.trucks t
        where t.id = truck_saved_locations.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'truck_saved_locations'
      and policyname = 'Truck owners and admins can create saved locations'
  ) then
    create policy "Truck owners and admins can create saved locations"
    on public.truck_saved_locations
    for insert
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      or exists (
        select 1
        from public.trucks t
        where t.id = truck_saved_locations.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'truck_saved_locations'
      and policyname = 'Truck owners and admins can update saved locations'
  ) then
    create policy "Truck owners and admins can update saved locations"
    on public.truck_saved_locations
    for update
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      or exists (
        select 1
        from public.trucks t
        where t.id = truck_saved_locations.truck_id
          and t.owner_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      or exists (
        select 1
        from public.trucks t
        where t.id = truck_saved_locations.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'truck_saved_locations'
      and policyname = 'Truck owners and admins can delete saved locations'
  ) then
    create policy "Truck owners and admins can delete saved locations"
    on public.truck_saved_locations
    for delete
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      or exists (
        select 1
        from public.trucks t
        where t.id = truck_saved_locations.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;
end $$;

revoke all on table public.truck_saved_locations from public, anon, authenticated;
grant select, insert, update, delete on table public.truck_saved_locations to authenticated;
grant all on table public.truck_saved_locations to service_role;
