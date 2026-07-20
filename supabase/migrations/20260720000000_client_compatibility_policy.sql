-- Generalizes the owner-only release policy into a scope-keyed client
-- compatibility policy. private.owner_release_policy becomes the
-- 'owner_management' row of private.client_compatibility_policy; a new
-- 'private_data' scope is added, disabled by default, to protect
-- get_private_profile() and future private-data read RPCs for every
-- authenticated role.
--
-- This migration is purely additive: private.owner_release_policy and its
-- audit table are left in place, untouched, as a rollback anchor.
-- public.get_owner_release_policy() and public.update_owner_release_policy()
-- keep their exact existing names and signatures so no currently-installed
-- owner client needs to change; they are repointed at the new table.
-- private.require_supported_owner_client() becomes a one-line wrapper around
-- the new private.require_supported_client(), so go_live_truck,
-- go_offline_truck, and enforce_owner_release_policy_trigger require no
-- changes at all.

create table if not exists private.client_compatibility_policy (
  scope text primary key,
  enabled boolean not null default false,
  paused boolean not null default false,
  applies_to_roles text[],
  minimum_android_build integer
    check (minimum_android_build is null or minimum_android_build > 0),
  minimum_ios_build integer
    check (minimum_ios_build is null or minimum_ios_build > 0),
  android_store_url text,
  ios_store_url text,
  update_title text not null default 'TruckTap has been upgraded!',
  update_message text not null default
    'Please install the latest version to continue.',
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);

revoke all on private.client_compatibility_policy from public, anon, authenticated;

create table if not exists private.client_compatibility_policy_audit (
  id bigint generated always as identity primary key,
  scope text not null,
  previous_policy jsonb not null,
  resulting_policy jsonb not null,
  actor_user_id uuid not null references auth.users(id),
  changed_at timestamptz not null default statement_timestamp(),
  reason text
);

create index if not exists client_compatibility_policy_audit_scope_changed_at_idx
  on private.client_compatibility_policy_audit (scope, changed_at desc);

revoke all on private.client_compatibility_policy_audit from public, anon, authenticated;

-- Carry the existing production owner-management configuration forward
-- exactly as configured today. This must never reset an already-enabled
-- gate, already-set minimums, or already-configured store URLs.
insert into private.client_compatibility_policy (
  scope, enabled, paused, applies_to_roles,
  minimum_android_build, minimum_ios_build,
  android_store_url, ios_store_url,
  update_title, update_message, updated_at, updated_by
)
select
  'owner_management',
  p.owner_gate_enabled,
  p.owner_management_paused,
  array['truck', 'owner', 'admin'],
  p.minimum_android_build,
  p.minimum_ios_build,
  p.android_store_url,
  p.ios_store_url,
  p.update_title,
  p.update_message,
  p.updated_at,
  p.updated_by
from private.owner_release_policy p
where p.singleton is true
on conflict (scope) do nothing;

-- New scope protecting private-data reads for every authenticated role.
-- Disabled by default, following the same safe-activation sequence already
-- proven for the owner gate: deploy disabled, publish compatible clients,
-- observe adoption, then enable.
insert into private.client_compatibility_policy (
  scope, enabled, paused, applies_to_roles,
  minimum_android_build, minimum_ios_build,
  android_store_url, ios_store_url,
  update_title, update_message
)
values (
  'private_data',
  false,
  false,
  null,
  null,
  null,
  null,
  null,
  'TruckTap has been upgraded!',
  'Please install the latest version to view your profile and account settings.'
)
on conflict (scope) do nothing;

-- Renamed from private.current_owner_client_release(): purely internal
-- header parsing, never granted to anon/authenticated, no external caller.
-- Behavior is unchanged.
create or replace function private.current_client_release()
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

revoke all on function private.current_client_release()
from public, anon, authenticated;

-- Single reusable compatibility gate. Every protected RPC calls this with
-- its scope name instead of embedding its own header/build comparison
-- logic. Fail-closed on a missing policy row, matching the precedent
-- already established by require_supported_owner_client.
create or replace function private.require_supported_client(
  p_scope text,
  p_action text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_policy private.client_compatibility_policy;
  v_platform text;
  v_native_build integer;
  v_minimum integer;
  v_role text;
  v_paused_detail text;
  v_paused_message text;
  v_update_required_detail text;
  v_update_required_message text;
begin
  if auth.uid() is null then
    return;
  end if;

  select p.*
  into v_policy
  from private.client_compatibility_policy p
  where p.scope = p_scope;

  if not found then
    -- An unseeded scope must never silently pass; treat it the same as an
    -- emergency pause so a missing row cannot become an unintended bypass.
    raise exception 'TRUCKTAP_%_UNAVAILABLE', upper(p_scope)
      using errcode = 'P0001',
            detail = p_scope || '_unavailable',
            hint = coalesce(p_action, p_scope);
  end if;

  if v_policy.applies_to_roles is not null then
    select p.role
    into v_role
    from public.profiles p
    where p.id = auth.uid();

    if v_role is null or not (v_role = any(v_policy.applies_to_roles)) then
      return;
    end if;
  end if;

  -- Preserve the exact historical error strings for 'owner_management' so
  -- every currently-installed owner client keeps parsing them identically.
  -- These two literals predate this generalized function and are
  -- intentionally not derived from the scope name.
  if p_scope = 'owner_management' then
    v_paused_detail := 'owner_management_paused';
    v_paused_message := 'TRUCKTAP_OWNER_MANAGEMENT_PAUSED';
    v_update_required_detail := 'owner_update_required';
    v_update_required_message := 'TRUCKTAP_OWNER_UPDATE_REQUIRED';
  else
    v_paused_detail := p_scope || '_paused';
    v_paused_message := 'TRUCKTAP_' || upper(p_scope) || '_PAUSED';
    v_update_required_detail := p_scope || '_update_required';
    v_update_required_message := 'TRUCKTAP_' || upper(p_scope) || '_UPDATE_REQUIRED';
  end if;

  if v_policy.paused then
    raise exception '%', v_paused_message
      using errcode = 'P0001',
            detail = v_paused_detail,
            hint = coalesce(p_action, p_scope);
  end if;

  if not v_policy.enabled then
    return;
  end if;

  select r.platform, r.native_build
  into v_platform, v_native_build
  from private.current_client_release() r;

  -- Web is centrally deployed and is not compared against native store
  -- build minimums. This is a documented, bounded exemption: every new page
  -- load gets the current release; the only residual case is an
  -- already-open browser tab, which the underlying data grants already
  -- reject unconditionally regardless of this gate.
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
    raise exception '%', v_update_required_message
      using errcode = 'P0001',
            detail = v_update_required_detail,
            hint = coalesce(p_action, p_scope);
  end if;
end;
$$;

revoke all on function private.require_supported_client(text, text)
from public, anon, authenticated;

-- Backward-compatible wrapper. go_live_truck, go_offline_truck, and
-- enforce_owner_release_policy_trigger all call this exact function name
-- and require no changes.
create or replace function private.require_supported_owner_client(
  p_action text default null
)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  select private.require_supported_client('owner_management', p_action);
$$;

revoke all on function private.require_supported_owner_client(text)
from public, anon, authenticated;

-- Generalized policy read, covering every scope in one round trip so future
-- scopes appear automatically with no client change.
create or replace function public.get_client_compatibility_policies()
returns table (
  scope text,
  enabled boolean,
  paused boolean,
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
    p.scope,
    p.enabled,
    p.paused,
    p.minimum_android_build,
    p.minimum_ios_build,
    p.android_store_url,
    p.ios_store_url,
    p.update_title,
    p.update_message,
    p.updated_at
  from private.client_compatibility_policy p;
$$;

revoke all on function public.get_client_compatibility_policies() from public;
grant execute on function public.get_client_compatibility_policies()
to anon, authenticated;

-- Preserves the existing RPC name/signature/output shape used by
-- currently-installed owner clients; now reads from the generalized table.
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
    p.enabled,
    p.paused,
    p.minimum_android_build,
    p.minimum_ios_build,
    p.android_store_url,
    p.ios_store_url,
    p.update_title,
    p.update_message,
    p.updated_at
  from private.client_compatibility_policy p
  where p.scope = 'owner_management';
$$;

revoke all on function public.get_owner_release_policy() from public;
grant execute on function public.get_owner_release_policy() to anon, authenticated;

-- Generalized admin RPC. Any scope's policy, including future ones, is
-- managed through this single function instead of a per-scope duplicate.
create or replace function public.update_client_compatibility_policy(
  p_scope text,
  p_enabled boolean,
  p_paused boolean,
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
  v_previous private.client_compatibility_policy;
  v_result private.client_compatibility_policy;
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

  if p_scope is null or btrim(p_scope) = '' then
    raise exception 'Scope is required' using errcode = '22023';
  end if;

  if p_enabled is null or p_paused is null then
    raise exception 'Enforcement values are required' using errcode = '22023';
  end if;

  if p_minimum_android_build is not null and p_minimum_android_build <= 0
    or p_minimum_ios_build is not null and p_minimum_ios_build <= 0
  then
    raise exception 'Minimum native builds must be positive integers'
      using errcode = '22023';
  end if;

  if p_enabled and (
    p_minimum_android_build is null
    or p_minimum_ios_build is null
    or v_android_url is null
    or v_ios_url is null
  ) then
    raise exception 'Enabled enforcement requires both platform minimums and direct store URLs'
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
  from private.client_compatibility_policy p
  where p.scope = p_scope
  for update;

  if not found then
    raise exception 'Unknown compatibility scope: %', p_scope using errcode = '22023';
  end if;

  update private.client_compatibility_policy
  set
    enabled = p_enabled,
    paused = p_paused,
    minimum_android_build = p_minimum_android_build,
    minimum_ios_build = p_minimum_ios_build,
    android_store_url = v_android_url,
    ios_store_url = v_ios_url,
    update_title = btrim(p_update_title),
    update_message = btrim(p_update_message),
    updated_at = statement_timestamp(),
    updated_by = auth.uid()
  where scope = p_scope
  returning * into v_result;

  insert into private.client_compatibility_policy_audit (
    scope, previous_policy, resulting_policy, actor_user_id, reason
  ) values (
    p_scope,
    to_jsonb(v_previous) - 'scope',
    to_jsonb(v_result) - 'scope',
    auth.uid(),
    v_reason
  );

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.update_client_compatibility_policy(
  text, boolean, boolean, integer, integer, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_client_compatibility_policy(
  text, boolean, boolean, integer, integer, text, text, text, text, text
) to authenticated;

-- Preserves the existing RPC name/signature AND return-value shape used by
-- currently-installed owner clients / operator tooling. The generalized RPC
-- returns generic column names (enabled, paused, ...); this wrapper remaps
-- them back to the legacy owner_gate_enabled/owner_management_paused keys
-- so any existing caller parsing the JSON result sees no difference.
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
  v_result jsonb;
begin
  v_result := public.update_client_compatibility_policy(
    'owner_management',
    p_owner_gate_enabled,
    p_owner_management_paused,
    p_minimum_android_build,
    p_minimum_ios_build,
    p_android_store_url,
    p_ios_store_url,
    p_update_title,
    p_update_message,
    p_reason
  );

  return jsonb_build_object(
    'owner_gate_enabled', v_result -> 'enabled',
    'owner_management_paused', v_result -> 'paused',
    'minimum_android_build', v_result -> 'minimum_android_build',
    'minimum_ios_build', v_result -> 'minimum_ios_build',
    'android_store_url', v_result -> 'android_store_url',
    'ios_store_url', v_result -> 'ios_store_url',
    'update_title', v_result -> 'update_title',
    'update_message', v_result -> 'update_message',
    'updated_at', v_result -> 'updated_at',
    'updated_by', v_result -> 'updated_by'
  );
end;
$$;

revoke all on function public.update_owner_release_policy(
  boolean, boolean, integer, integer, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_owner_release_policy(
  boolean, boolean, integer, integer, text, text, text, text, text
) to authenticated;
