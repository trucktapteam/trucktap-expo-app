-- Reconstructed verbatim from production supabase_migrations.schema_migrations
-- (version 20260815044340). Already applied to production; history-alignment only.

create or replace function private.find_matching_hands_free_stop(
  p_truck_id uuid,
  p_now timestamptz,
  p_latitude double precision,
  p_longitude double precision
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_settings private.hands_free_live_settings;
  v_ids uuid[];
begin
  select s.* into v_settings
  from private.hands_free_live_settings s
  where s.singleton is true;

  -- Kill switch: while the feature is disabled, never select or lock any
  -- candidate rows. This keeps the function a true no-op until enabled.
  if v_settings.early_adopt_enabled is not true then
    return null;
  end if;

  -- Candidate selection and locking happen in a plain (non-aggregate) inner
  -- query. Postgres disallows FOR UPDATE combined with aggregates in the same
  -- query level, so the exact-one-match determination is done in the outer
  -- query over the already-locked row set, never combined unsafely.
  select array_agg(c.id) into v_ids
  from (
    select s.id
    from public.upcoming_stops s
    where s.truck_id = p_truck_id
      and s.auto_manage_live is true
      and s.status = 'scheduled'
      and s.automation_cancelled_at is null
      and s.auto_start_resolved_at is null
      and p_now >= s.starts_at - v_settings.early_adopt_window
      and p_now <= s.ends_at
      and (
        s.latitude is null or s.longitude is null
        or p_latitude is null or p_longitude is null
        or v_settings.early_adopt_max_distance_meters is null
        or (
          2 * 6371000 * asin(sqrt(
            sin(radians(s.latitude - p_latitude) / 2) ^ 2
            + cos(radians(p_latitude)) * cos(radians(s.latitude))
              * sin(radians(s.longitude - p_longitude) / 2) ^ 2
          ))
        ) <= v_settings.early_adopt_max_distance_meters
      )
    order by s.id
    for update of s
  ) c;

  if v_ids is null or array_length(v_ids, 1) is null then
    return null; -- no candidate
  end if;

  if array_length(v_ids, 1) = 1 then
    return v_ids[1];
  end if;

  return null; -- ambiguous: multiple matches, fail safe to manual
end;
$function$;
