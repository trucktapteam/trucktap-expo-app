-- Permanent owner-client release policy.
-- Enforcement is deliberately disabled by default. This migration can be
-- deployed before Phase 1A so incompatible native owner clients can be
-- blocked before canonical LIVE location ownership is enabled.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.owner_release_policy (
  singleton boolean primary key default true check (singleton),
  owner_gate_enabled boolean not null default false,
  owner_management_paused boolean not null default false,
  minimum_android_build integer
    check (minimum_android_build is null or minimum_android_build > 0),
  minimum_ios_build integer
    check (minimum_ios_build is null or minimum_ios_build > 0),
  android_store_url text,
  ios_store_url text,
  update_title text not null default 'TruckTap has been upgraded!',
  update_message text not null default
    'Please install the latest version to manage your truck and use the new LIVE system.',
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into private.owner_release_policy (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists private.owner_release_policy_audit (
  id bigint generated always as identity primary key,
  previous_policy jsonb not null,
  resulting_policy jsonb not null,
  actor_user_id uuid not null references auth.users(id),
  changed_at timestamptz not null default statement_timestamp(),
  reason text
);

create index if not exists owner_release_policy_audit_changed_at_idx
  on private.owner_release_policy_audit (changed_at desc);

create table if not exists private.owner_client_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  native_build integer not null check (native_build > 0),
  app_version text,
  last_seen_at timestamptz not null default statement_timestamp(),
  primary key (user_id, platform)
);

create index if not exists owner_client_versions_last_seen_idx
  on private.owner_client_versions (last_seen_at desc);

revoke all on private.owner_release_policy from public, anon, authenticated;
revoke all on private.owner_release_policy_audit from public, anon, authenticated;
revoke all on private.owner_client_versions from public, anon, authenticated;

create or replace function private.owner_release_policy_json(
  p_policy private.owner_release_policy
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'owner_gate_enabled', p_policy.owner_gate_enabled,
    'owner_management_paused', p_policy.owner_management_paused,
    'minimum_android_build', p_policy.minimum_android_build,
    'minimum_ios_build', p_policy.minimum_ios_build,
    'android_store_url', p_policy.android_store_url,
    'ios_store_url', p_policy.ios_store_url,
    'update_title', p_policy.update_title,
    'update_message', p_policy.update_message,
    'updated_at', p_policy.updated_at,
    'updated_by', p_policy.updated_by
  );
$$;

revoke all on function private.owner_release_policy_json(
  private.owner_release_policy
) from public, anon, authenticated;

create or replace function public.get_owner_release_policy()
returns table (
  owner_gate_enabled boolean,
  owner_management_paused boolean,
  minimum_android_build integer,
  minimum_ios_build integer,
  android_store_url text,
  ios_store_url text,
  update_title text,
  update_message text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    p.owner_gate_enabled,
    p.owner_management_paused,
    p.minimum_android_build,
    p.minimum_ios_build,
    p.android_store_url,
    p.ios_store_url,
    p.update_title,
    p.update_message,
    p.updated_at
  from private.owner_release_policy p
  where p.singleton is true;
$$;

revoke all on function public.get_owner_release_policy() from public;
grant execute on function public.get_owner_release_policy() to anon, authenticated;

create or replace function private.current_owner_client_release()
returns table (
  platform text,
  native_build integer,
  app_version text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_platform text;
  v_build_text text;
  v_app_version text;
begin
  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception
    when others then
      v_headers := '{}'::jsonb;
  end;

  v_platform := lower(nullif(btrim(v_headers ->> 'x-trucktap-platform'), ''));
  v_build_text := nullif(btrim(v_headers ->> 'x-trucktap-build'), '');
  v_app_version := nullif(left(btrim(v_headers ->> 'x-trucktap-app-version'), 64), '');

  if v_platform not in ('android', 'ios', 'web') then
    return query select null::text, null::integer, v_app_version;
    return;
  end if;

  if v_platform = 'web' then
    return query select v_platform, null::integer, v_app_version;
    return;
  end if;

  if v_build_text is null or v_build_text !~ '^[1-9][0-9]{0,8}$' then
    return query select v_platform, null::integer, v_app_version;
    return;
  end if;

  return query select v_platform, v_build_text::integer, v_app_version;
end;
$$;

revoke all on function private.current_owner_client_release()
from public, anon, authenticated;

create or replace function private.require_supported_owner_client(
  p_action text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_policy private.owner_release_policy;
  v_platform text;
  v_native_build integer;
  v_minimum integer;
  v_role text;
begin
  if auth.uid() is null then
    return;
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is null or v_role not in ('truck', 'owner', 'admin') then
    return;
  end if;

  select p.*
  into v_policy
  from private.owner_release_policy p
  where p.singleton is true;

  if not found then
    raise exception 'TRUCKTAP_OWNER_MANAGEMENT_PAUSED'
      using errcode = 'P0001',
            detail = 'owner_management_paused';
  end if;

  if v_policy.owner_management_paused then
    raise exception 'TRUCKTAP_OWNER_MANAGEMENT_PAUSED'
      using errcode = 'P0001',
            detail = 'owner_management_paused',
            hint = coalesce(p_action, 'owner_management');
  end if;

  if not v_policy.owner_gate_enabled then
    return;
  end if;

  select r.platform, r.native_build
  into v_platform, v_native_build
  from private.current_owner_client_release() r;

  -- Web is centrally deployed and is not governed by native store builds.
  if v_platform = 'web' then
    return;
  end if;

  v_minimum := case v_platform
    when 'android' then v_policy.minimum_android_build
    when 'ios' then v_policy.minimum_ios_build
    else null
  end;

  if v_platform is null
    or v_native_build is null
    or v_minimum is null
    or v_native_build < v_minimum
  then
    raise exception 'TRUCKTAP_OWNER_UPDATE_REQUIRED'
      using errcode = 'P0001',
            detail = 'owner_update_required',
            hint = coalesce(p_action, 'owner_management');
  end if;
end;
$$;

revoke all on function private.require_supported_owner_client(text)
from public, anon, authenticated;

create or replace function public.observe_owner_client_version()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_platform text;
  v_native_build integer;
  v_app_version text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is null or v_role not in ('truck', 'owner', 'admin') then
    return false;
  end if;

  select r.platform, r.native_build, r.app_version
  into v_platform, v_native_build, v_app_version
  from private.current_owner_client_release() r;

  if v_platform not in ('android', 'ios') or v_native_build is null then
    return false;
  end if;

  insert into private.owner_client_versions (
    user_id, platform, native_build, app_version, last_seen_at
  ) values (
    auth.uid(), v_platform, v_native_build, v_app_version, statement_timestamp()
  )
  on conflict (user_id, platform) do update
  set
    native_build = excluded.native_build,
    app_version = excluded.app_version,
    last_seen_at = excluded.last_seen_at;

  return true;
end;
$$;

revoke all on function public.observe_owner_client_version() from public, anon;
grant execute on function public.observe_owner_client_version() to authenticated;

create or replace function public.update_owner_release_policy(
  p_owner_gate_enabled boolean,
  p_owner_management_paused boolean,
  p_minimum_android_build integer,
  p_minimum_ios_build integer,
  p_android_store_url text,
  p_ios_store_url text,
  p_update_title text,
  p_update_message text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_previous private.owner_release_policy;
  v_result private.owner_release_policy;
  v_android_url text := nullif(btrim(p_android_store_url), '');
  v_ios_url text := nullif(btrim(p_ios_store_url), '');
  v_reason text := nullif(left(btrim(p_reason), 500), '');
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Admin authorization required' using errcode = '42501';
  end if;

  if p_owner_gate_enabled is null or p_owner_management_paused is null then
    raise exception 'Release-policy enforcement values are required'
      using errcode = '22023';
  end if;

  if p_minimum_android_build is not null and p_minimum_android_build <= 0
    or p_minimum_ios_build is not null and p_minimum_ios_build <= 0
  then
    raise exception 'Minimum native builds must be positive integers'
      using errcode = '22023';
  end if;

  if p_owner_gate_enabled and (
    p_minimum_android_build is null
    or p_minimum_ios_build is null
    or v_android_url is null
    or v_ios_url is null
  ) then
    raise exception 'Enabled owner enforcement requires both platform minimums and direct store URLs'
      using errcode = '22023';
  end if;

  if v_android_url is not null
    and v_android_url !~ '^https://play\.google\.com/store/apps/details\?'
  then
    raise exception 'Android store URL must be a direct Google Play listing'
      using errcode = '22023';
  end if;

  if v_ios_url is not null
    and v_ios_url !~ '^https://apps\.apple\.com/.*/app/.*/id[0-9]+'
  then
    raise exception 'iOS store URL must be a direct App Store listing'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_update_title), '') is null
    or nullif(btrim(p_update_message), '') is null
  then
    raise exception 'Update title and message are required'
      using errcode = '22023';
  end if;

  select p.*
  into v_previous
  from private.owner_release_policy p
  where p.singleton is true
  for update;

  update private.owner_release_policy
  set
    owner_gate_enabled = p_owner_gate_enabled,
    owner_management_paused = p_owner_management_paused,
    minimum_android_build = p_minimum_android_build,
    minimum_ios_build = p_minimum_ios_build,
    android_store_url = v_android_url,
    ios_store_url = v_ios_url,
    update_title = btrim(p_update_title),
    update_message = btrim(p_update_message),
    updated_at = statement_timestamp(),
    updated_by = auth.uid()
  where singleton is true
  returning * into v_result;

  insert into private.owner_release_policy_audit (
    previous_policy, resulting_policy, actor_user_id, reason
  ) values (
    private.owner_release_policy_json(v_previous),
    private.owner_release_policy_json(v_result),
    auth.uid(),
    v_reason
  );

  return private.owner_release_policy_json(v_result);
end;
$$;

revoke all on function public.update_owner_release_policy(
  boolean, boolean, integer, integer, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_owner_release_policy(
  boolean, boolean, integer, integer, text, text, text, text, text
) to authenticated;

create or replace function private.enforce_owner_release_policy_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.require_supported_owner_client(tg_table_schema || '.' || tg_table_name);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_owner_release_policy_trigger()
from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'trucks', 'locations', 'upcoming_stops', 'review_replies', 'profiles'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'drop trigger if exists enforce_owner_release_policy on public.%I',
        v_table
      );
      execute format(
        'create trigger enforce_owner_release_policy
         before insert or update or delete on public.%I
         for each row execute function private.enforce_owner_release_policy_trigger()',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- Preserve the current production RPC contracts while adding the disabled-by-
-- default gate. Phase 1A replaces these bodies and repeats the same check.
create or replace function public.go_live_truck(
  p_truck_id uuid,
  p_source text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.trucks
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '12 hours';
  v_truck public.trucks;
begin
  if p_source not in ('manual', 'schedule', 'nudge_confirmation', 'expiration', 'archive') then
    raise exception 'Invalid LIVE status source: %', p_source using errcode = '22023';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.trucks t
    where t.id = p_truck_id and t.owner_id = auth.uid()
  ) and not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Not authorized to change LIVE status for truck %', p_truck_id
      using errcode = '42501';
  end if;

  perform private.require_supported_owner_client('go_live_truck');

  update public.trucks
  set is_open = true,
      live_started_at = v_now,
      last_live_updated_at = v_now,
      live_expires_at = v_expires,
      live_source = p_source,
      updated_at = v_now
  where id = p_truck_id
  returning * into v_truck;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  insert into public.truck_live_events (
    truck_id, action, source, actor_user_id, location_label,
    latitude, longitude, metadata
  ) values (
    p_truck_id, 'go_live', p_source, auth.uid(), p_location_label,
    p_latitude, p_longitude,
    jsonb_build_object('rpc', 'go_live_truck') || coalesce(p_metadata, '{}'::jsonb)
  );
  return v_truck;
end;
$$;

revoke all on function public.go_live_truck(
  uuid, text, double precision, double precision, text, jsonb
) from public, anon;
grant execute on function public.go_live_truck(
  uuid, text, double precision, double precision, text, jsonb
) to authenticated;

create or replace function public.go_offline_truck(
  p_truck_id uuid,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.trucks
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_truck public.trucks;
begin
  if p_source not in ('manual', 'schedule', 'nudge_confirmation', 'expiration', 'archive') then
    raise exception 'Invalid LIVE status source: %', p_source using errcode = '22023';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.trucks t
    where t.id = p_truck_id and t.owner_id = auth.uid()
  ) and not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Not authorized to change LIVE status for truck %', p_truck_id
      using errcode = '42501';
  end if;

  perform private.require_supported_owner_client('go_offline_truck');

  update public.trucks
  set is_open = false,
      live_expires_at = null,
      live_source = p_source,
      updated_at = v_now
  where id = p_truck_id
  returning * into v_truck;

  if not found then
    raise exception 'Truck % not found', p_truck_id using errcode = 'P0002';
  end if;

  insert into public.truck_live_events (
    truck_id, action, source, actor_user_id, metadata
  ) values (
    p_truck_id, 'go_offline', p_source, auth.uid(),
    jsonb_build_object('rpc', 'go_offline_truck') || coalesce(p_metadata, '{}'::jsonb)
  );
  return v_truck;
end;
$$;

revoke all on function public.go_offline_truck(uuid, text, jsonb)
from public, anon;
grant execute on function public.go_offline_truck(uuid, text, jsonb)
to authenticated;
