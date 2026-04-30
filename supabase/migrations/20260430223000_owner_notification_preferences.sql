alter table public.profiles
  add column if not exists notify_owner_favorites boolean default true,
  add column if not exists notify_owner_reviews boolean default true;

update public.profiles
set
  notify_owner_favorites = coalesce(notify_owner_favorites, true),
  notify_owner_reviews = coalesce(notify_owner_reviews, true)
where notify_owner_favorites is null
   or notify_owner_reviews is null;
