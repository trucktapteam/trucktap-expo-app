alter table public.sightings enable row level security;

grant select, insert on table public.sightings to anon, authenticated;
grant update, delete on table public.sightings to authenticated;

drop policy if exists "Anyone can create sightings" on public.sightings;

create policy "Anyone can create sightings"
on public.sightings
for insert
to anon, authenticated
with check (
  user_id is null
  or auth.uid() = user_id
);
