alter table public.trucks
add column if not exists service_area text,
add column if not exists facebook_url text,
add column if not exists instagram_url text,
add column if not exists tiktok_url text,
add column if not exists trust_badges jsonb not null default '[]'::jsonb;

do $$
declare
  has_truck_address boolean;
  has_truck_label boolean;
  has_locations boolean;
  has_location_truck_id boolean;
  has_location_label boolean;
  has_location_updated_at boolean;
  has_location_created_at boolean;
  location_order_sql text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trucks' and column_name = 'address'
  ) into has_truck_address;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trucks' and column_name = 'label'
  ) into has_truck_label;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'locations'
  ) into has_locations;

  if has_truck_address then
    execute $sql$
      update public.trucks
      set service_area = nullif(trim(address::text), '')
      where nullif(trim(coalesce(service_area, '')), '') is null
        and nullif(trim(address::text), '') is not null
    $sql$;
  end if;

  if has_truck_label then
    execute $sql$
      update public.trucks
      set service_area = nullif(trim(label::text), '')
      where nullif(trim(coalesce(service_area, '')), '') is null
        and nullif(trim(label::text), '') is not null
    $sql$;
  end if;

  if has_locations then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'locations' and column_name = 'truck_id'
    ) into has_location_truck_id;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'locations' and column_name = 'label'
    ) into has_location_label;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'locations' and column_name = 'updated_at'
    ) into has_location_updated_at;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'locations' and column_name = 'created_at'
    ) into has_location_created_at;

    if has_location_truck_id and has_location_label then
      location_order_sql := case
        when has_location_updated_at and has_location_created_at then 'coalesce(updated_at, created_at) desc nulls last'
        when has_location_updated_at then 'updated_at desc nulls last'
        when has_location_created_at then 'created_at desc nulls last'
        else 'truck_id'
      end;

      execute format($sql$
        update public.trucks t
        set service_area = latest_locations.label
        from (
          select distinct on (truck_id)
            truck_id,
            nullif(trim(label::text), '') as label
          from public.locations
          where nullif(trim(label::text), '') is not null
          order by truck_id, %s
        ) latest_locations
        where t.id::text = latest_locations.truck_id::text
          and nullif(trim(coalesce(t.service_area, '')), '') is null
      $sql$, location_order_sql);
    end if;
  end if;
end $$;

comment on column public.trucks.service_area is
'Owner-provided primary/general service area shown on public profiles.';

comment on column public.trucks.trust_badges is
'Optional owner-selected public trust badges such as veteran_owned and family_owned.';
