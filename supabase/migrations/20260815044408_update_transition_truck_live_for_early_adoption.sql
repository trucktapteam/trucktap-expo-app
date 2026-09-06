-- Reconstructed verbatim from production supabase_migrations.schema_migrations
-- (version 20260815044408). Already applied to production; history-alignment only.

CREATE OR REPLACE FUNCTION private.transition_truck_live(p_action text, p_truck_id uuid, p_source text, p_latitude double precision, p_longitude double precision, p_location_label text, p_stop_id uuid, p_expected_live_stop_id uuid, p_actor_user_id uuid, p_metadata jsonb, p_expected_live_started_at timestamp with time zone, p_require_live_started_at_match boolean)
 RETURNS TABLE(changed boolean, reason text, truck_row trucks)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_now timestamptz := statement_timestamp();
  v_truck public.trucks;
  v_previous_stop_id uuid;
  v_location_label text;
  v_location_rows integer;
  v_settings private.hands_free_live_settings;
begin
  if p_action not in ('go_live', 'go_offline') then
    raise exception 'Invalid LIVE transition action: %', p_action
      using errcode = '22023';
  end if;

  if p_source not in ('manual', 'schedule', 'nudge_confirmation', 'expiration', 'archive') then
    raise exception 'Invalid LIVE status source: %', p_source
      using errcode = '22023';
  end if;

  if p_metadata is not null and jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'LIVE transition metadata must be a JSON object'
      using errcode = '22023';
  end if;

  if p_action = 'go_live' and p_source = 'schedule' and p_stop_id is null then
    raise exception 'Scheduled Go LIVE requires a non-null stop ID'
      using errcode = '22023';
  end if;

  if p_action = 'go_offline' and p_source = 'schedule' then
    if p_expected_live_stop_id is null then
      raise exception 'Scheduled Go Offline requires a non-null expected live_stop_id'
        using errcode = '22023';
    end if;

    if p_expected_live_started_at is null then
      raise exception 'Scheduled Go Offline requires expected live_started_at'
        using errcode = '22023';
    end if;

    if p_require_live_started_at_match is not true then
      raise exception 'Scheduled Go Offline requires live-session restart protection'
        using errcode = '22023';
    end if;
  end if;

  select t.*
  into v_truck
  from public.trucks t
  where t.id = p_truck_id
  for update;

  if not found then
    raise exception 'Truck % not found', p_truck_id
      using errcode = 'P0002';
  end if;

  select s.* into v_settings
  from private.hands_free_live_settings s
  where s.singleton is true;

  if p_action = 'go_live' then
    if p_latitude is null
      or p_latitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      or p_latitude < -90
      or p_latitude > 90
      or p_longitude is null
      or p_longitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
      or p_longitude < -180
      or p_longitude > 180
    then
      raise exception 'Go LIVE requires finite coordinates in range'
        using errcode = '22023';
    end if;

    if p_location_label is null or length(btrim(p_location_label)) = 0 then
      raise exception 'Go LIVE requires a nonblank location label'
        using errcode = '22023';
    end if;

    if p_stop_id is not null then
      if p_source <> 'schedule' then
        raise exception 'Only schedule transitions may acquire stop ownership'
          using errcode = '22023';
      end if;

      if not exists (
        select 1
        from public.upcoming_stops s
        where s.id = p_stop_id
          and s.truck_id = p_truck_id
      ) then
        raise exception 'Scheduled stop % does not belong to truck %', p_stop_id, p_truck_id
          using errcode = '22023';
      end if;

      -- Manual always wins: scheduled automation never replaces any LIVE
      -- session. A processor can safely retry and receive this no-op.
      if v_truck.is_open is true then
        return query select false, 'already_live', v_truck;
        return;
      end if;
    end if;

    if to_regclass('public.locations') is null then
      raise exception 'Canonical locations table is unavailable'
        using errcode = '55000';
    end if;

    perform set_config('trucktap.canonical_live_transition', 'on', true);

    -- This project supports both the current locations schema and its legacy
    -- variant without updated_at. Locking the truck serializes canonical LIVE
    -- writes for a truck without assuming a deployed unique constraint that is
    -- absent from this repository's migrations. SQL text is fixed; values are
    -- bound, never interpolated.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'locations'
        and column_name = 'updated_at'
    ) then
      execute $location$
        update public.locations
        set
          latitude = $2,
          longitude = $3,
          label = $4,
          updated_at = $5
        where truck_id::text = $1::text
      $location$
      using p_truck_id, p_latitude, p_longitude, btrim(p_location_label), v_now;
    else
      execute $location$
        update public.locations
        set
          latitude = $2,
          longitude = $3,
          label = $4
        where truck_id::text = $1::text
      $location$
      using p_truck_id, p_latitude, p_longitude, btrim(p_location_label);
    end if;

    get diagnostics v_location_rows = row_count;

    if v_location_rows > 1 then
      raise exception 'Truck % has multiple canonical location rows', p_truck_id
        using errcode = '21000';
    end if;

    if v_location_rows = 0 then
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'locations'
          and column_name = 'updated_at'
      ) then
        execute $location$
          insert into public.locations (
            truck_id, latitude, longitude, label, updated_at
          ) values ($1, $2, $3, $4, $5)
        $location$
        using p_truck_id, p_latitude, p_longitude, btrim(p_location_label), v_now;
      else
        execute $location$
          insert into public.locations (
            truck_id, latitude, longitude, label
          ) values ($1, $2, $3, $4)
        $location$
        using p_truck_id, p_latitude, p_longitude, btrim(p_location_label);
      end if;
    end if;

    update public.trucks
    set
      is_open = true,
      live_started_at = v_now,
      last_live_updated_at = v_now,
      live_expires_at = case
        -- Inert while early_adopt_enabled is false: identical to prior
        -- behavior (flat 12h) regardless of source, in every branch.
        when v_settings.early_adopt_enabled is true
          and p_source = 'schedule' and p_stop_id is not null then
          (select su.ends_at + v_settings.end_grace + interval '30 minutes'
           from public.upcoming_stops su
           where su.id = p_stop_id)
        when v_settings.early_adopt_enabled is true then
          v_now + interval '6 hours'
        else
          v_now + interval '12 hours'
      end,
      live_source = p_source,
      live_stop_id = case when p_source = 'schedule' then p_stop_id else null end,
      updated_at = v_now
    where id = p_truck_id
    returning * into v_truck;

    insert into public.truck_live_events (
      truck_id,
      action,
      source,
      actor_user_id,
      stop_id,
      location_label,
      latitude,
      longitude,
      metadata
    ) values (
      p_truck_id,
      'go_live',
      p_source,
      p_actor_user_id,
      case when p_source = 'schedule' then p_stop_id else null end,
      btrim(p_location_label),
      p_latitude,
      p_longitude,
      coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object('transition', 'private.transition_truck_live')
    );

    return query select true, 'went_live', v_truck;
    return;
  end if;

  v_previous_stop_id := v_truck.live_stop_id;

  if (
    p_expected_live_stop_id is not null
    or p_require_live_started_at_match
  ) and v_truck.is_open is not true
  then
    return query select false, 'already_offline', v_truck;
    return;
  end if;

  -- Expected stop ownership is the scheduled-end compare-and-set. An old stop
  -- receives a safe no-op instead of closing a manual or newer stop session.
  if p_expected_live_stop_id is not null
    and v_truck.live_stop_id is distinct from p_expected_live_stop_id
  then
    return query select false, 'live_stop_mismatch', v_truck;
    return;
  end if;

  -- Stale cleanup also protects against a session restarted after its candidate
  -- scan. IS DISTINCT FROM intentionally handles legacy null timestamps.
  if p_require_live_started_at_match
    and v_truck.live_started_at is distinct from p_expected_live_started_at
  then
    return query select false, 'live_session_restarted', v_truck;
    return;
  end if;

  perform set_config('trucktap.canonical_live_transition', 'on', true);

  update public.trucks
  set
    is_open = false,
    live_expires_at = null,
    live_source = p_source,
    live_stop_id = null,
    updated_at = v_now
  where id = p_truck_id
  returning * into v_truck;

  select l.label
  into v_location_label
  from public.locations l
  where l.truck_id::text = p_truck_id::text
  limit 1;

  insert into public.truck_live_events (
    truck_id,
    action,
    source,
    actor_user_id,
    stop_id,
    location_label,
    metadata
  ) values (
    p_truck_id,
    'go_offline',
    p_source,
    p_actor_user_id,
    v_previous_stop_id,
    v_location_label,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('transition', 'private.transition_truck_live')
  );

  return query select true, 'went_offline', v_truck;
end;
$function$;
