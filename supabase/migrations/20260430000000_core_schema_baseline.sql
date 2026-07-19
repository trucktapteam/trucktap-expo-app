-- Authoritative baseline for the foundational public schema that predates the
-- version-controlled migration history.
--
-- Source: read-only production schema inventory on 2026-07-19, reconciled
-- with every later repository migration. This file intentionally excludes
-- dashboard-created webhooks and credentials; later migrations own those
-- objects. It is safe to apply to an existing deployment because table,
-- constraint, index, and policy creation is guarded.

-- Historical migration 20260709001000 assumes pg_cron is installed. Production
-- already satisfied that prerequisite when the migration was applied. Declare
-- it here for fresh Supabase bootstraps instead of rewriting applied history.
create extension if not exists pg_cron;

create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null references auth.users(id),
  name text not null,
  cuisine text null,
  description text null,
  image_url text null,
  latitude double precision null,
  longitude double precision null,
  is_open boolean default false,
  is_disabled boolean default false,
  created_at timestamptz default now(),
  cuisine_type text null,
  phone text null,
  bio text null,
  website text null,
  hero_image text null,
  logo text null,
  updated_at timestamptz default now(),
  operating_hours jsonb null,
  gallery_images jsonb default '[]'::jsonb,
  menu_images jsonb default '[]'::jsonb,
  menu_items jsonb default '[]'::jsonb,
  announcements jsonb default '[]'::jsonb,
  is_verified boolean default false,
  is_test boolean not null default false,
  archived boolean not null default false,
  archived_at timestamptz null,
  archive_reason text null,
  service_area text null,
  facebook_url text null,
  instagram_url text null,
  tiktok_url text null,
  trust_badges jsonb not null default '[]'::jsonb,
  last_live_updated_at timestamptz null,
  live_started_at timestamptz null,
  live_expires_at timestamptz null,
  live_source text null
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text default 'user',
  created_at timestamptz default now(),
  display_name text default '',
  profile_photo text null,
  push_token text default '',
  notify_favorites_open boolean not null default true,
  notify_new_trucks boolean not null default true,
  notify_announcements boolean not null default true,
  truck_id uuid null references public.trucks(id),
  last_favorite_notification_at timestamptz null,
  notify_owner_favorites boolean default true,
  notify_owner_reviews boolean default true
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  truck_id uuid not null references public.trucks(id) on delete cascade,
  created_at timestamptz default now(),
  constraint favorites_user_id_truck_id_key unique (user_id, truck_id)
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid null references public.trucks(id) on delete cascade,
  label text null,
  latitude double precision null,
  longitude double precision null,
  created_at timestamptz default now(),
  constraint locations_truck_id_key unique (truck_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sightings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  truck_name text not null,
  photo_url text not null,
  latitude double precision not null,
  longitude double precision not null,
  notes text null,
  expires_at timestamptz not null,
  user_id uuid null references auth.users(id)
);

create table if not exists public.truck_checkins (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  checkin_date date generated always as (
    (created_at at time zone 'America/New_York')::date
  ) stored
);

create sequence if not exists public.analytics_events_id_seq;

create table if not exists public.analytics_events (
  id bigint primary key default nextval('public.analytics_events_id_seq'::regclass),
  created_at timestamptz not null default now(),
  user_id uuid null,
  truck_id uuid null,
  event_type text not null,
  event_source text not null,
  metadata jsonb default '{}'::jsonb,
  platform text null,
  session_id text null
);

alter sequence public.analytics_events_id_seq
owned by public.analytics_events.id;

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  truck_id uuid null,
  user_id uuid null,
  push_token text null,
  title text null,
  body text null,
  status text null,
  expo_response jsonb null,
  created_at timestamptz default now()
);

-- Existing deployments may have the tables but not every named constraint.
-- Add only missing production constraints, without rebuilding or validating
-- unrelated data.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.trucks'::regclass
      and conname = 'trucks_owner_id_fkey'
  ) then
    alter table public.trucks
      add constraint trucks_owner_id_fkey
      foreign key (owner_id) references auth.users(id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_truck_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_truck_id_fkey
      foreign key (truck_id) references public.trucks(id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_email_key'
  ) then
    alter table public.profiles
      add constraint profiles_email_key unique (email);
  end if;
end;
$$;

create index if not exists idx_favorites_truck_id
  on public.favorites (truck_id);
create index if not exists idx_favorites_user_id
  on public.favorites (user_id);

create index if not exists idx_truck_checkins_truck_id
  on public.truck_checkins (truck_id);
create index if not exists idx_truck_checkins_user_id
  on public.truck_checkins (user_id);
create unique index if not exists idx_unique_daily_checkin
  on public.truck_checkins (truck_id, user_id, checkin_date);

create index if not exists sightings_user_id_idx
  on public.sightings (user_id);

create index if not exists idx_analytics_events_created_at
  on public.analytics_events (created_at);
create index if not exists idx_analytics_events_event_type
  on public.analytics_events (event_type);
create index if not exists idx_analytics_events_truck_event_type
  on public.analytics_events (truck_id, event_type);
create index if not exists idx_analytics_events_truck_id
  on public.analytics_events (truck_id);
create index if not exists idx_analytics_events_user_created_at
  on public.analytics_events (user_id, created_at);
create index if not exists idx_analytics_events_user_id
  on public.analytics_events (user_id);

alter table public.trucks enable row level security;
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.locations enable row level security;
alter table public.reviews enable row level security;
alter table public.sightings enable row level security;
alter table public.truck_checkins enable row level security;
alter table public.analytics_events enable row level security;
alter table public.notification_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Public can read basic profile info'
  ) then
    create policy "Public can read basic profile info"
      on public.profiles for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can read own profile'
  ) then
    create policy "Users can read own profile"
      on public.profiles for select to authenticated
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.profiles for update to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'trucks'
      and policyname = 'Public read trucks'
  ) then
    create policy "Public read trucks"
      on public.trucks for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'trucks'
      and policyname = 'Owners can insert own trucks'
  ) then
    create policy "Owners can insert own trucks"
      on public.trucks for insert to authenticated
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'trucks'
      and policyname = 'Owners can update own trucks'
  ) then
    create policy "Owners can update own trucks"
      on public.trucks for update to authenticated
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'trucks'
      and policyname = 'Admins can update any truck'
  ) then
    create policy "Admins can update any truck"
      on public.trucks for update to authenticated
      using (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'favorites'
      and policyname = 'Users can manage their own favorites'
  ) then
    create policy "Users can manage their own favorites"
      on public.favorites
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'Public read locations'
  ) then
    create policy "Public read locations"
      on public.locations for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'locations_insert_own_truck'
  ) then
    create policy "locations_insert_own_truck"
      on public.locations for insert to authenticated
      with check (
        exists (
          select 1 from public.trucks
          where trucks.id = locations.truck_id
            and trucks.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'locations_update_own_truck'
  ) then
    create policy "locations_update_own_truck"
      on public.locations for update to authenticated
      using (
        exists (
          select 1 from public.trucks
          where trucks.id = locations.truck_id
            and trucks.owner_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.trucks
          where trucks.id = locations.truck_id
            and trucks.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'Anyone can read reviews'
  ) then
    create policy "Anyone can read reviews"
      on public.reviews for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'Authenticated users can insert their own reviews'
  ) then
    create policy "Authenticated users can insert their own reviews"
      on public.reviews for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Public can read sightings'
  ) then
    create policy "Public can read sightings"
      on public.sightings for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Anyone can create sightings'
  ) then
    create policy "Anyone can create sightings"
      on public.sightings for insert to anon, authenticated
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Users can update own sightings'
  ) then
    create policy "Users can update own sightings"
      on public.sightings for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'sightings'
      and policyname = 'Users can delete own sightings'
  ) then
    create policy "Users can delete own sightings"
      on public.sightings for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'truck_checkins'
      and policyname = 'Users can create own checkins'
  ) then
    create policy "Users can create own checkins"
      on public.truck_checkins for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'truck_checkins'
      and policyname = 'Users can view own checkins'
  ) then
    create policy "Users can view own checkins"
      on public.truck_checkins for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'truck_checkins'
      and policyname = 'Admins can view all checkins'
  ) then
    create policy "Admins can view all checkins"
      on public.truck_checkins for select
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'analytics_events'
      and policyname = 'Allow analytics inserts'
  ) then
    create policy "Allow analytics inserts"
      on public.analytics_events for insert to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'notification_logs'
      and policyname = 'notification_logs_admin_select'
  ) then
    create policy "notification_logs_admin_select"
      on public.notification_logs for select to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end;
$$;

-- Preserve all application-visible operations while removing production's
-- unnecessary ALL grants (including TRUNCATE, REFERENCES, and TRIGGER).
revoke all on table public.trucks from public, anon, authenticated;
grant select on table public.trucks to anon;
grant select, insert, update on table public.trucks to authenticated;
grant all on table public.trucks to service_role;

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

revoke all on table public.favorites from public, anon, authenticated;
grant select, insert, update, delete on table public.favorites to authenticated;
grant all on table public.favorites to service_role;

revoke all on table public.locations from public, anon, authenticated;
grant select on table public.locations to anon;
grant select, insert, update on table public.locations to authenticated;
grant all on table public.locations to service_role;

revoke all on table public.reviews from public, anon, authenticated;
grant select on table public.reviews to anon;
grant select, insert on table public.reviews to authenticated;
grant all on table public.reviews to service_role;

revoke all on table public.sightings from public, anon, authenticated;
grant select, insert on table public.sightings to anon;
grant select, insert, update, delete on table public.sightings to authenticated;
grant all on table public.sightings to service_role;

revoke all on table public.truck_checkins from public, anon, authenticated;
grant select, insert on table public.truck_checkins to authenticated;
grant all on table public.truck_checkins to service_role;

revoke all on table public.analytics_events from public, anon, authenticated;
grant insert on table public.analytics_events to anon;
grant select, insert on table public.analytics_events to authenticated;
grant all on table public.analytics_events to service_role;

revoke all on table public.notification_logs from public, anon, authenticated;
grant select on table public.notification_logs to authenticated;
grant all on table public.notification_logs to service_role;

do $$
declare
  v_sequence regclass;
begin
  select pg_get_serial_sequence(
    'public.analytics_events',
    'id'
  )::regclass into v_sequence;

  if v_sequence is not null then
    execute format(
      'revoke all on sequence %s from public, anon, authenticated',
      v_sequence
    );
    execute format(
      'grant usage on sequence %s to anon, authenticated',
      v_sequence
    );
    execute format(
      'grant all on sequence %s to service_role',
      v_sequence
    );
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (id, email, role, display_name)
  values (
    new.id,
    new.email,
    'customer',
    split_part(new.email, '@', 1)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
'Creates the default customer profile for a newly inserted auth user. Trigger-only; clients cannot execute it directly.';

revoke all on function public.handle_new_user()
from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
