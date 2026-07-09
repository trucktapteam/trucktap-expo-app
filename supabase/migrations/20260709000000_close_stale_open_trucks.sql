create or replace function public.close_stale_open_trucks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_window interval := interval '12 hours';
  has_locations boolean;
  has_location_truck_id boolean;
  has_location_updated_at boolean;
  has_location_created_at boolean;
  location_timestamp_sql text;
  closed_count integer := 0;
begin
  /*
    Trust rule:
    if TruckTap cannot prove a LIVE truck has fresh serving-location activity,
    stale should resolve Closed, not Open.
  */
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'locations'
  ) into has_locations;

  if not has_locations then
    update public.trucks
    set
      is_open = false,
      updated_at = now()
    where is_open is true;

    get diagnostics closed_count = row_count;
    return closed_count;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'truck_id'
  ) into has_location_truck_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'updated_at'
  ) into has_location_updated_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'created_at'
  ) into has_location_created_at;

  if not has_location_truck_id or not (has_location_updated_at or has_location_created_at) then
    update public.trucks
    set
      is_open = false,
      updated_at = now()
    where is_open is true;

    get diagnostics closed_count = row_count;
    return closed_count;
  end if;

  location_timestamp_sql := case
    when has_location_updated_at and has_location_created_at then 'coalesce(l.updated_at, l.created_at)'
    when has_location_updated_at then 'l.updated_at'
    else 'l.created_at'
  end;

  execute format($sql$
    update public.trucks t
    set
      is_open = false,
      updated_at = now()
    where t.is_open is true
      and not exists (
        select 1
        from public.locations l
        where l.truck_id::text = t.id::text
          and %1$s is not null
          and %1$s >= now() - $1
      )
  $sql$, location_timestamp_sql)
  using stale_window;

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

comment on function public.close_stale_open_trucks() is
'Closes stale open trucks using the trust rule that stale LIVE status should resolve Closed, not Open.';

do $$
declare
  has_pg_cron boolean;
  has_existing_job boolean := false;
begin
  /*
    Schedule the stale-close safety net only when pg_cron is already enabled.
    If pg_cron is unavailable, the function remains callable by a manual/server job.
  */
  has_pg_cron :=
    to_regnamespace('cron') is not null
    and to_regclass('cron.job') is not null
    and to_regprocedure('cron.schedule(text,text,text)') is not null;

  if has_pg_cron then
    execute 'select exists (select 1 from cron.job where jobname = $1)'
      into has_existing_job
      using 'close-stale-open-trucks';

    if not has_existing_job then
      execute 'select cron.schedule($1, $2, $3)'
        using
          'close-stale-open-trucks',
          '*/15 * * * *',
          'select public.close_stale_open_trucks();';
    end if;
  else
    raise notice 'pg_cron is not enabled; public.close_stale_open_trucks() was created but not scheduled.';
  end if;
end $$;
