create or replace function public.close_stale_open_trucks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_window interval := interval '12 hours';
  closed_count integer := 0;
begin
  /*
    Trust rule:
    if TruckTap cannot prove a LIVE truck has fresh owner activity,
    stale should resolve Closed, not Open.

    The app's Go LIVE path writes public.trucks.updated_at with the same savedAt
    timestamp used for the LIVE state change. In production, public.locations rows
    are reused and public.locations.created_at is the original row creation time,
    not a LIVE freshness timestamp. Do not use locations.created_at to decide
    whether an open truck is fresh.
  */
  update public.trucks t
  set
    is_open = false,
    updated_at = now()
  where t.is_open is true
    and (
      t.updated_at is null
      or t.updated_at < now() - stale_window
    );

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

comment on function public.close_stale_open_trucks() is
'Closes stale open trucks after 12 hours using public.trucks.updated_at, matching the app LIVE freshness fallback. locations.created_at is row creation time and is not a LIVE freshness signal.';
