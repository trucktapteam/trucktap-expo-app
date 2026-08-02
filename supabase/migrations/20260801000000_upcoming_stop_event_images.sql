-- Optional one-image event flyer for each upcoming stop.
-- This migration is intentionally local for review and is not applied automatically.

alter table public.upcoming_stops
  add column if not exists event_image_url text null;

comment on column public.upcoming_stops.event_image_url is
  'Public URL for the optional event flyer owned by this scheduled stop.';

-- upcoming_stops uses column-level grants to keep private automation fields out
-- of public select(*). Extend only the existing display/owner mutation surface.
grant select (event_image_url) on table public.upcoming_stops to anon, authenticated;
grant insert (event_image_url) on table public.upcoming_stops to authenticated;
grant update (event_image_url) on table public.upcoming_stops to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'upcoming-stop-images',
  'upcoming-stop-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read upcoming stop images" on storage.objects;
create policy "Public can read upcoming stop images"
on storage.objects for select
using (bucket_id = 'upcoming-stop-images');

drop policy if exists "Owners and admins can upload upcoming stop images" on storage.objects;
create policy "Owners and admins can upload upcoming stop images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'upcoming-stop-images'
  and (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f-]{36}$'
  and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.upcoming_stops s
      join public.trucks t on t.id = s.truck_id
      where s.id::text = (storage.foldername(storage.objects.name))[2]
        and s.truck_id::text = (storage.foldername(storage.objects.name))[1]
        and t.owner_id = auth.uid()
    )
  )
);

drop policy if exists "Owners and admins can update upcoming stop images" on storage.objects;
create policy "Owners and admins can update upcoming stop images"
on storage.objects for update to authenticated
using (
  bucket_id = 'upcoming-stop-images'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.upcoming_stops s
      join public.trucks t on t.id = s.truck_id
      where s.id::text = (storage.foldername(storage.objects.name))[2]
        and s.truck_id::text = (storage.foldername(storage.objects.name))[1]
        and t.owner_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'upcoming-stop-images'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.upcoming_stops s
      join public.trucks t on t.id = s.truck_id
      where s.id::text = (storage.foldername(storage.objects.name))[2]
        and s.truck_id::text = (storage.foldername(storage.objects.name))[1]
        and t.owner_id = auth.uid()
    )
  )
);

-- Delete remains truck-folder scoped so cleanup can safely run after the stop
-- row has been deleted. The app verifies stop ownership before deleting it.
drop policy if exists "Owners and admins can delete upcoming stop images" on storage.objects;
create policy "Owners and admins can delete upcoming stop images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'upcoming-stop-images'
  and (
    public.is_admin()
    or exists (
      select 1 from public.trucks t
      where t.id::text = (storage.foldername(storage.objects.name))[1]
        and t.owner_id = auth.uid()
    )
  )
);
