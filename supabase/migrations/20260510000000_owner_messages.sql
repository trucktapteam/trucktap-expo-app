create table if not exists public.owner_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  type text not null default 'general'
    check (type in ('general', 'important', 'maintenance', 'urgent')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  target_scope text not null default 'all_trucks'
    check (target_scope in ('all_trucks', 'truck')),
  target_truck_id uuid references public.trucks(id) on delete cascade
);

create table if not exists public.owner_message_reads (
  message_id uuid not null references public.owner_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists owner_messages_created_at_idx
  on public.owner_messages(created_at desc);

create index if not exists owner_message_reads_user_id_idx
  on public.owner_message_reads(user_id);

alter table public.owner_messages enable row level security;
alter table public.owner_message_reads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_messages'
      and policyname = 'Admins can send owner messages'
  ) then
    create policy "Admins can send owner messages"
    on public.owner_messages
    for insert
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_messages'
      and policyname = 'Truck owners and admins can read owner messages'
  ) then
    create policy "Truck owners and admins can read owner messages"
    on public.owner_messages
    for select
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      or exists (
        select 1 from public.trucks t
        where t.owner_id = auth.uid()
          and (
            owner_messages.target_scope = 'all_trucks'
            or owner_messages.target_truck_id = t.id
          )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_message_reads'
      and policyname = 'Users can read own owner message read receipts'
  ) then
    create policy "Users can read own owner message read receipts"
    on public.owner_message_reads
    for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_message_reads'
      and policyname = 'Users can mark owner messages read'
  ) then
    create policy "Users can mark owner messages read"
    on public.owner_message_reads
    for insert
    with check (
      auth.uid() = user_id
      and (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
        or exists (
          select 1
          from public.owner_messages m
          join public.trucks t on t.owner_id = auth.uid()
          where m.id = owner_message_reads.message_id
            and (
              m.target_scope = 'all_trucks'
              or m.target_truck_id = t.id
            )
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_message_reads'
      and policyname = 'Users can update own owner message read receipts'
  ) then
    create policy "Users can update own owner message read receipts"
    on public.owner_message_reads
    for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
        or exists (
          select 1
          from public.owner_messages m
          join public.trucks t on t.owner_id = auth.uid()
          where m.id = owner_message_reads.message_id
            and (
              m.target_scope = 'all_trucks'
              or m.target_truck_id = t.id
            )
        )
      )
    );
  end if;
end $$;
