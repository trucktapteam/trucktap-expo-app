create table if not exists public.truck_live_events (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks(id) on delete cascade,
  action text not null check (action in ('go_live', 'go_offline')),
  source text not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  stop_id uuid null references public.upcoming_stops(id) on delete set null,
  location_label text null,
  latitude double precision null,
  longitude double precision null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists truck_live_events_truck_created_idx
  on public.truck_live_events (truck_id, created_at desc);

create index if not exists truck_live_events_created_idx
  on public.truck_live_events (created_at desc);

create index if not exists truck_live_events_action_source_created_idx
  on public.truck_live_events (action, source, created_at desc);

alter table public.truck_live_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'truck_live_events'
      and policyname = 'Truck owners can read own live events'
  ) then
    create policy "Truck owners can read own live events"
    on public.truck_live_events
    for select
    using (
      exists (
        select 1
        from public.trucks t
        where t.id = truck_live_events.truck_id
          and t.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'truck_live_events'
      and policyname = 'Admins can read all live events'
  ) then
    create policy "Admins can read all live events"
    on public.truck_live_events
    for select
    using (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'truck_live_events'
      and policyname = 'Truck owners and admins can create live events'
  ) then
    create policy "Truck owners and admins can create live events"
    on public.truck_live_events
    for insert
    with check (
      auth.uid() is not null
      and (
        actor_user_id is null
        or actor_user_id = auth.uid()
      )
      and (
        exists (
          select 1
          from public.trucks t
          where t.id = truck_live_events.truck_id
            and t.owner_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
    );
  end if;
end $$;

grant select, insert on public.truck_live_events to authenticated;

comment on table public.truck_live_events is
'Audit log for TruckTap LIVE status changes. Quick check: select * from public.truck_live_events where created_at >= current_date order by created_at desc;';

comment on column public.truck_live_events.source is
'Source that caused the LIVE status change, such as manual, expiration, archive, schedule, or nudge_confirmation.';
