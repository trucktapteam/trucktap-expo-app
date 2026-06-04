create table if not exists public.upcoming_stops (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_text text not null,
  note text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'delayed', 'cancelled', 'sold_out', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (length(btrim(location_text)) > 0)
);

create index if not exists upcoming_stops_truck_id_starts_at_idx
  on public.upcoming_stops(truck_id, starts_at);

create index if not exists upcoming_stops_starts_at_idx
  on public.upcoming_stops(starts_at);

alter table public.upcoming_stops enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'upcoming_stops'
      and policyname = 'Public can read visible truck upcoming stops'
  ) then
    create policy "Public can read visible truck upcoming stops"
    on public.upcoming_stops
    for select
    using (
      exists (
        select 1
        from public.trucks t
        where t.id = upcoming_stops.truck_id
          and coalesce(t.archived, false) = false
          and t.archived_at is null
          and coalesce(t.is_test, false) = false
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      or exists (
        select 1
        from public.trucks t
        where t.id = upcoming_stops.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'upcoming_stops'
      and policyname = 'Truck owners and admins can create upcoming stops'
  ) then
    create policy "Truck owners and admins can create upcoming stops"
    on public.upcoming_stops
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
        where t.id = upcoming_stops.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'upcoming_stops'
      and policyname = 'Truck owners and admins can update upcoming stops'
  ) then
    create policy "Truck owners and admins can update upcoming stops"
    on public.upcoming_stops
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
        where t.id = upcoming_stops.truck_id
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
        where t.id = upcoming_stops.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'upcoming_stops'
      and policyname = 'Truck owners and admins can delete upcoming stops'
  ) then
    create policy "Truck owners and admins can delete upcoming stops"
    on public.upcoming_stops
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
        where t.id = upcoming_stops.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;
end $$;
