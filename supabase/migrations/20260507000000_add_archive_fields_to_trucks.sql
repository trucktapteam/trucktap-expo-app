alter table public.trucks
add column if not exists archived boolean not null default false,
add column if not exists archived_at bigint,
add column if not exists archive_reason text;

comment on column public.trucks.archived is
'Hides a truck from public/customer discovery without deleting the row.';

