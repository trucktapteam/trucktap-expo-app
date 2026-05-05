alter table public.trucks
add column if not exists is_test boolean not null default false;

comment on column public.trucks.is_test is
  'When true, hides the truck from customer-facing TruckTap discovery and public browsing surfaces.';

