-- Reconstructed verbatim from production supabase_migrations.schema_migrations
-- (version 20260815044434). Already applied to production; history-alignment only.

CREATE OR REPLACE FUNCTION public.go_live_truck(p_truck_id uuid, p_source text, p_latitude double precision, p_longitude double precision, p_location_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS trucks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_truck public.trucks;
  v_owner_id uuid;
  v_matched_stop_id uuid;
  v_result record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select t.owner_id
  into v_owner_id
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  if v_owner_id is distinct from auth.uid()
    and not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Not authorized to change LIVE status for truck %', p_truck_id
      using errcode = '42501';
  end if;

  perform private.require_supported_owner_client('go_live_truck');

  -- Returns null (no adoption) whenever early_adopt_enabled is false, or
  -- when there is no unambiguous matching Hands-Free stop. This keeps every
  -- call identical to pre-adoption behavior while the feature is disabled.
  v_matched_stop_id := private.find_matching_hands_free_stop(
    p_truck_id, statement_timestamp(), p_latitude, p_longitude
  );

  select r.changed, r.truck_row
  into v_result
  from private.transition_truck_live(
    'go_live',
    p_truck_id,
    case when v_matched_stop_id is not null then 'schedule' else 'manual' end,
    p_latitude,
    p_longitude,
    p_location_label,
    v_matched_stop_id,
    null,
    auth.uid(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'rpc', 'go_live_truck',
      'requested_source', p_source,
      'requested_source_trusted', false,
      'adoption', v_matched_stop_id is not null
    ),
    null,
    false
  ) r;

  v_truck := v_result.truck_row;

  -- Only record the adoption if the transition actually changed the truck
  -- into this stop's ownership. Guards against an "already_live" no-op
  -- (e.g. a double-tap) falsely marking an unrelated stop as adopted.
  if v_matched_stop_id is not null
    and v_result.changed is true
    and v_truck.live_stop_id = v_matched_stop_id
  then
    update public.upcoming_stops
    set
      auto_start_resolved_at = v_truck.live_started_at,
      auto_live_started_at   = v_truck.live_started_at,
      auto_start_outcome     = 'went_live_manual_early'
    where id = v_matched_stop_id;
  end if;

  return v_truck;
end;
$function$;
