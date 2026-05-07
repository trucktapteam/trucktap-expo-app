alter table public.sightings
add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists sightings_user_id_idx on public.sightings(user_id);

alter table public.sightings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Public can read sightings'
  ) then
    create policy "Public can read sightings"
    on public.sightings
    for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Anyone can create sightings'
  ) then
    create policy "Anyone can create sightings"
    on public.sightings
    for insert
    with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Users can update own sightings'
  ) then
    create policy "Users can update own sightings"
    on public.sightings
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Users can delete own sightings'
  ) then
    create policy "Users can delete own sightings"
    on public.sightings
    for delete
    using (auth.uid() = user_id);
  end if;
end $$;
