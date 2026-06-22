create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  truck_id uuid not null references public.trucks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint review_replies_body_not_blank check (length(btrim(body)) > 0)
);

create unique index if not exists review_replies_one_active_per_review_idx
  on public.review_replies(review_id)
  where deleted_at is null;

create index if not exists review_replies_review_id_idx
  on public.review_replies(review_id);

create index if not exists review_replies_truck_id_idx
  on public.review_replies(truck_id);

create or replace function public.set_review_replies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_review_reply_identity_changes()
returns trigger
language plpgsql
as $$
begin
  if new.review_id is distinct from old.review_id
    or new.truck_id is distinct from old.truck_id
    or new.owner_id is distinct from old.owner_id then
    raise exception 'review_id, truck_id, and owner_id cannot be changed after insert';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_review_reply_identity_changes on public.review_replies;
create trigger prevent_review_reply_identity_changes
before update on public.review_replies
for each row
execute function public.prevent_review_reply_identity_changes();

drop trigger if exists set_review_replies_updated_at on public.review_replies;
create trigger set_review_replies_updated_at
before update on public.review_replies
for each row
execute function public.set_review_replies_updated_at();

alter table public.review_replies enable row level security;

drop policy if exists "Public can read active review replies" on public.review_replies;
create policy "Public can read active review replies"
on public.review_replies
for select
using (
  deleted_at is null
  and exists (
    select 1
    from public.reviews r
    join public.trucks t on t.id = r.truck_id
    where r.id = review_replies.review_id
      and r.truck_id = review_replies.truck_id
      and coalesce(t.archived, false) = false
      and t.archived_at is null
      and coalesce(t.is_test, false) = false
  )
);

drop policy if exists "Truck owners and admins can read managed review replies" on public.review_replies;
create policy "Truck owners and admins can read managed review replies"
on public.review_replies
for select
using (
  exists (
    select 1
    from public.trucks t
    where t.id = review_replies.truck_id
      and t.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists "Truck owners and admins can create review replies" on public.review_replies;
create policy "Truck owners and admins can create review replies"
on public.review_replies
for insert
with check (
  deleted_at is null
  and owner_id = auth.uid()
  and length(btrim(body)) > 0
  and exists (
    select 1
    from public.reviews r
    join public.trucks t on t.id = r.truck_id
    where r.id = review_replies.review_id
      and r.truck_id = review_replies.truck_id
      and (
        t.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  )
);

drop policy if exists "Truck owners and admins can update review replies" on public.review_replies;
create policy "Truck owners and admins can update review replies"
on public.review_replies
for update
using (
  exists (
    select 1
    from public.trucks t
    where t.id = review_replies.truck_id
      and (
        t.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  )
)
with check (
  length(btrim(body)) > 0
  and exists (
    select 1
    from public.reviews r
    join public.trucks t on t.id = r.truck_id
    where r.id = review_replies.review_id
      and r.truck_id = review_replies.truck_id
      and (
        t.owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  )
);

drop policy if exists "Admins can delete review replies" on public.review_replies;
create policy "Admins can delete review replies"
on public.review_replies
for delete
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

revoke select on public.review_replies from anon, authenticated;
grant select (id, review_id, truck_id, body, created_at, updated_at, deleted_at)
on public.review_replies to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'review_replies'
  ) then
    alter publication supabase_realtime add table public.review_replies;
  end if;
end $$;
