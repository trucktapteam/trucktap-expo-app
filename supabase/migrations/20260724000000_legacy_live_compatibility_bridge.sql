-- Legacy LIVE compatibility bridge.
--
-- Permanent-until-retired fix for the F-Bomb forced-offline incident
-- (see 20260710010000_hotfix_legacy_cleanup_fallback.sql, which patched the
-- symptom in production out-of-band and is left untouched by this
-- migration). The currently-released production owner client performs Go
-- LIVE / Stop Serving as up to three independent, unaudited network calls
-- instead of the canonical go_live_truck/go_offline_truck RPCs:
--   1. UPDATE trucks SET is_open, updated_at ...
--   2. UPSERT locations (truck_id, latitude, longitude, label) -- go-live only
--   3. INSERT truck_live_events (action, source:'manual', actor_user_id, ...)
-- Call 3's failure is confirmed never surfaced to the owner (caught and
-- logged client-side only -- verified against the actual shipped source at
-- commit fa8ad51). Calls 1 and 2 do surface failures.
--
-- This migration adds two new, narrowly-scoped trigger functions that
-- detect exactly that shape and transparently upgrade it to canonical
-- semantics, plus one small additive branch each in the two Phase 1A guard
-- functions (private.guard_truck_live_state, private.guard_open_truck_
-- location) so the bridge's enrichment is trusted -- narrowly, not broadly.
-- (Call 3's own duplicate-suppression need is met differently -- see the
-- truck_live_events note in "Scope discipline" below, not a third trigger.)
-- Phase 1A's own bodies are not edited in place; this is a later
-- CREATE OR REPLACE layered on top, matching this repo's existing pattern
-- for evolving a function over time (e.g. close_stale_open_trucks() has six
-- successive redefinitions across migration history). Canonical RPC
-- behavior, RLS, and every other Phase 1A guarantee are unchanged.
--
-- Coordination mechanism: a transaction-local GUC,
-- trucktap.canonical_live_transition, set to 'legacy_bridge' (distinct from
-- the canonical RPC's own 'on') by the bridge before it enriches NEW. This
-- works across separate trigger invocations within one statement because
-- set_config(..., true) is transaction-scoped, not tied to current_user or
-- SECURITY DEFINER context (which does NOT persist across separate trigger
-- function calls -- this is why a standalone trigger cannot instead try to
-- satisfy guard_truck_live_state's current_user = <transition owner> check).
-- No client-facing RPC exposes set_config, so this GUC is not client-
-- settable.
--
-- Trigger ordering: Postgres fires same-phase BEFORE triggers on one table
-- in alphabetical order by trigger name. bridge_legacy_live_state sorts
-- before guard_truck_live_state, and bridge_legacy_open_truck_location
-- sorts before guard_open_truck_location (both 'b' < 'g'), so each bridge
-- runs first and can enrich NEW / set the GUC before its guard evaluates
-- them. supabase/tests/legacy_live_compatibility_bridge.sql proves this
-- ordering empirically end-to-end (a raw legacy write succeeding at all is
-- only possible if the bridge really ran first), not just by naming
-- convention.
--
-- Scope discipline: only the exact legacy shape is bridged.
--   * trucks: is_open and updated_at are the ONLY columns that may differ
--     from the stored row; if anything else changed too (a "mixed" write)
--     or any of the six protected lifecycle columns were touched directly,
--     the bridge does nothing and guard_truck_live_state's original
--     unconditional reject applies, unchanged.
--   * locations: the write is only bridged for the same truck, only within
--     a bounded window immediately after that truck's own bridged Go LIVE
--     (trucks.live_source = 'legacy_bridge'), and only for insert/update of
--     exactly {truck_id, latitude, longitude, label}. The window is
--     currently 2 minutes -- see v_legacy_location_bridge_window in
--     private.bridge_legacy_open_truck_location for the exact value and the
--     tradeoffs behind it. A canonically-live truck (live_source <>
--     'legacy_bridge') gets no
--     exemption at all -- this is not a blanket authenticated-client
--     carve-out, and ownership continues to be enforced by locations' own
--     existing RLS policies (locations_insert_own_truck /
--     locations_update_own_truck), which run before any trigger sees the
--     row.
--   * truck_live_events: the bridge writes the one authoritative audit row
--     itself (source = 'legacy_bridge'). The legacy client's own immediately
--     -following insert attempt for the same truck+action+actor is rejected
--     at the grant level -- 20260718020000_hands_free_live_scheduled_
--     automation.sql already revokes authenticated's direct INSERT on this
--     table (writes are RPC-only by design), and that revoke is deliberately
--     left in place, not reopened. A graceful, trigger-level idempotent
--     no-op was the original design goal here, but it structurally requires
--     authenticated to hold a standing INSERT grant for the trigger to ever
--     run -- and restoring that grant regresses two existing, already-
--     shipped tests that lock in "authenticated clients should not forge
--     LIVE audit events" as a Trust Engine invariant
--     (supabase/tests/auth002_restore_intended_table_grants.sql,
--     supabase/tests/hands_free_live_scheduled_automation.sql). Confirmed
--     from the actual shipped legacy source that this insert's failure is
--     always caught and logged client-side only, never surfaced to the
--     owner (see the incident-history note above) -- so a flat permission
--     denial and a graceful no-op are behaviorally identical to the owner.
--     Preserving the tested invariant was chosen over the graceful-UX
--     preference given that equivalence. RLS ("Truck owners and admins can
--     create live events") independently already blocks cross-owner
--     forgery too, as defense in depth on top of the grant boundary.
--
-- Removal after legacy-client retirement:
--   1. Confirm readiness: no bridged transitions in a sustained recent
--      window --
--        select count(*) from public.truck_live_events
--        where source = 'legacy_bridge'
--          and created_at > now() - interval '30 days';
--      -- expect 0, ideally cross-checked against owner_management minimum-
--      -- build enforcement (docs/owner-release-policy.md) actually being on.
--   2. Ship a forward migration that:
--        drop trigger bridge_legacy_open_truck_location on public.locations;
--        drop function private.bridge_legacy_open_truck_location();
--        drop trigger bridge_legacy_live_state on public.trucks;
--        drop function private.bridge_legacy_live_state();
--      then CREATE OR REPLACE both guard functions back to their pre-bridge
--      Phase 1A bodies (delete the added 'legacy_bridge' branch from each).
--   No data migration or column cleanup is needed -- historical
--   'legacy_bridge'-sourced truck_live_events rows are left as inert audit
--   history.

-- ============================================================
-- 1. trucks: detect the legacy shape and enrich NEW with canonical values.
-- ============================================================

create or replace function private.bridge_legacy_live_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Cheap bail-out first: most trucks updates never touch is_open at all.
  if old.is_open is not distinct from new.is_open then
    return new;
  end if;

  -- If the caller already touched a protected lifecycle column directly,
  -- this is not a naive legacy write -- let guard_truck_live_state decide.
  if old.last_live_updated_at is distinct from new.last_live_updated_at
    or old.live_started_at is distinct from new.live_started_at
    or old.live_expires_at is distinct from new.live_expires_at
    or old.live_source is distinct from new.live_source
    or old.live_stop_id is distinct from new.live_stop_id
  then
    return new;
  end if;

  -- Reject mixed payloads: is_open/updated_at must be the ONLY columns that
  -- changed. A jsonb diff over the whole row (minus those two) catches any
  -- other simultaneous edit without hand-enumerating every trucks column.
  if (to_jsonb(new) - 'is_open' - 'updated_at')
    is distinct from (to_jsonb(old) - 'is_open' - 'updated_at')
  then
    return new;
  end if;

  perform set_config('trucktap.canonical_live_transition', 'legacy_bridge', true);

  if new.is_open is true then
    -- GO LIVE: populate exactly what the canonical RPC would have produced.
    new.live_started_at := v_now;
    new.last_live_updated_at := v_now;
    new.live_expires_at := v_now + interval '12 hours';
    new.live_source := 'legacy_bridge';
    new.live_stop_id := null;

    insert into public.truck_live_events (
      truck_id, action, source, actor_user_id, metadata
    ) values (
      new.id,
      'go_live',
      'legacy_bridge',
      auth.uid(),
      jsonb_build_object('transition', 'private.bridge_legacy_live_state')
    );
  else
    -- GO OFFLINE: mirror go_offline_truck exactly -- live_started_at and
    -- last_live_updated_at are intentionally left untouched (session
    -- history, not a target of going offline).
    new.live_expires_at := null;
    new.live_source := 'legacy_bridge';
    new.live_stop_id := null;

    insert into public.truck_live_events (
      truck_id, action, source, actor_user_id, metadata
    ) values (
      new.id,
      'go_offline',
      'legacy_bridge',
      auth.uid(),
      jsonb_build_object('transition', 'private.bridge_legacy_live_state')
    );
  end if;

  return new;
end;
$$;

comment on function private.bridge_legacy_live_state() is
'TEMPORARY legacy-client compatibility. Detects the exact unaudited direct is_open+updated_at write and enriches it to canonical LIVE/OFFLINE semantics plus one authoritative truck_live_events row. Remove after legacy-client retirement -- see removal plan in 20260724000000_legacy_live_compatibility_bridge.sql.';

revoke all on function private.bridge_legacy_live_state() from public;
revoke all on function private.bridge_legacy_live_state() from anon;
revoke all on function private.bridge_legacy_live_state() from authenticated;

drop trigger if exists bridge_legacy_live_state on public.trucks;

create trigger bridge_legacy_live_state
before update on public.trucks
for each row
execute function private.bridge_legacy_live_state();

-- ============================================================
-- 2. guard_truck_live_state: narrow, re-verified acceptance of the bridge's
--    own enrichment. Canonical-path behavior below is byte-for-byte
--    identical to the Phase 1A original.
-- ============================================================

create or replace function private.guard_truck_live_state()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_transition_owner name;
  v_guc text;
begin
  if old.is_open is not distinct from new.is_open
    and old.last_live_updated_at is not distinct from new.last_live_updated_at
    and old.live_started_at is not distinct from new.live_started_at
    and old.live_expires_at is not distinct from new.live_expires_at
    and old.live_source is not distinct from new.live_source
    and old.live_stop_id is not distinct from new.live_stop_id
  then
    return new;
  end if;

  v_guc := coalesce(current_setting('trucktap.canonical_live_transition', true), '');

  if v_guc = 'legacy_bridge' then
    -- Defense in depth: don't just trust the GUC, re-derive that NEW is
    -- exactly the shape private.bridge_legacy_live_state is defined to
    -- produce for a go_live or go_offline transition.
    if new.live_source = 'legacy_bridge'
      and (
        (
          old.is_open is not true and new.is_open is true
          and new.live_stop_id is null
          and new.live_started_at is not null
          and new.last_live_updated_at is not null
          and new.live_started_at = new.last_live_updated_at
          and new.live_expires_at = new.live_started_at + interval '12 hours'
        )
        or (
          old.is_open is true and new.is_open is not true
          and new.live_stop_id is null
          and new.live_expires_at is null
          and new.live_started_at is not distinct from old.live_started_at
          and new.last_live_updated_at is not distinct from old.last_live_updated_at
        )
      )
    then
      return new;
    end if;

    raise exception 'LIVE state must change through the canonical transition'
      using errcode = '42501';
  end if;

  select pg_get_userbyid(p.proowner)
  into v_transition_owner
  from pg_catalog.pg_proc p
  where p.pronamespace = to_regnamespace('private')
    and p.proname = 'transition_truck_live'
    and p.pronargs = 12;

  if v_guc <> 'on'
    or v_transition_owner is null
    or current_user <> v_transition_owner
  then
    raise exception 'LIVE state must change through the canonical transition'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.guard_truck_live_state() is
'Rejects direct updates to LIVE/session fields except from the owner-executed private canonical transition, or from private.bridge_legacy_live_state''s narrowly-verified TEMPORARY legacy-compatibility enrichment (see 20260724000000_legacy_live_compatibility_bridge.sql).';

revoke all on function private.guard_truck_live_state() from public;
revoke all on function private.guard_truck_live_state() from anon;
revoke all on function private.guard_truck_live_state() from authenticated;

-- ============================================================
-- 3. locations: narrowly-scoped compatibility for the legacy client's
--    immediately-following location upsert after a bridged Go LIVE.
-- ============================================================

create or replace function private.bridge_legacy_open_truck_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_truck record;
  -- Estimate, not a measured value: no production telemetry exists yet on
  -- the real gap between the legacy client's trucks update committing and
  -- its locations upsert arriving. Chosen as "generous but bounded" given
  -- the two calls are awaited back-to-back in one client function with no
  -- user interaction between them (normally sub-second to a few seconds).
  -- Widening this trades less false-rejection risk (a legitimate delayed
  -- write bounces with a visible error) for more stale-clobber risk (a very
  -- late write from one bridged session lands during a newer one for the
  -- same truck and overwrites its location); narrowing trades the other
  -- way. Revisit with real gap-distribution data once available -- see
  -- source = 'legacy_bridge' in truck_live_events for that measurement.
  v_legacy_location_bridge_window constant interval := interval '2 minutes';
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Exact legacy shape only: truck_id/id/created_at must be unchanged,
    -- and at least one of latitude/longitude/label must actually change.
    if old.truck_id is distinct from new.truck_id
      or old.id is distinct from new.id
      or old.created_at is distinct from new.created_at
    then
      return new;
    end if;

    if old.latitude is not distinct from new.latitude
      and old.longitude is not distinct from new.longitude
      and old.label is not distinct from new.label
    then
      return new;
    end if;
  end if;

  if new.truck_id is null then
    return new;
  end if;

  -- Lock the truck row: closes the race between this check and a
  -- concurrent canonical/bridged offline transition.
  select t.is_open, t.live_source, t.last_live_updated_at
  into v_truck
  from public.trucks t
  where t.id = new.truck_id
  for update;

  if not found then
    return new;
  end if;

  if v_truck.is_open is true
    and v_truck.live_source = 'legacy_bridge'
    and v_truck.last_live_updated_at is not null
    and v_truck.last_live_updated_at > statement_timestamp() - v_legacy_location_bridge_window
  then
    perform set_config('trucktap.canonical_live_transition', 'legacy_bridge', true);
  end if;

  return new;
end;
$$;

comment on function private.bridge_legacy_open_truck_location() is
'TEMPORARY legacy-client compatibility. Permits the legacy client''s own locations upsert for the same truck only within v_legacy_location_bridge_window of that truck''s own bridged Go LIVE (currently 2 minutes -- see that constant''s declaration for the value and rationale). No broad authenticated-client exemption -- a canonically-live truck gets none of this. Remove after legacy-client retirement -- see removal plan in 20260724000000_legacy_live_compatibility_bridge.sql.';

revoke all on function private.bridge_legacy_open_truck_location() from public;
revoke all on function private.bridge_legacy_open_truck_location() from anon;
revoke all on function private.bridge_legacy_open_truck_location() from authenticated;

drop trigger if exists bridge_legacy_open_truck_location on public.locations;

create trigger bridge_legacy_open_truck_location
before insert or update or delete on public.locations
for each row
execute function private.bridge_legacy_open_truck_location();

-- ============================================================
-- 4. guard_open_truck_location: same narrow additive branch. Canonical-path
--    behavior below is unchanged from the Phase 1A original.
-- ============================================================

create or replace function private.guard_open_truck_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_truck_id text;
  v_new_truck_id text;
  v_open_truck_exists boolean := false;
  v_truck record;
  v_transition_owner name;
  v_guc text;
begin
  if tg_op <> 'INSERT' then
    v_old_truck_id := old.truck_id::text;
  end if;

  if tg_op <> 'DELETE' then
    v_new_truck_id := new.truck_id::text;
  end if;

  for v_truck in
    select t.is_open
    from public.trucks t
    where (
        t.id::text = v_old_truck_id
        or t.id::text = v_new_truck_id
      )
    order by t.id
    for update
  loop
    if v_truck.is_open is true then
      v_open_truck_exists := true;
    end if;
  end loop;

  if not v_open_truck_exists then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_guc := coalesce(current_setting('trucktap.canonical_live_transition', true), '');

  if v_guc = 'legacy_bridge' then
    -- private.bridge_legacy_open_truck_location already verified this is
    -- the narrow legacy shape for a truck it just bridged into LIVE.
    return new;
  end if;

  select pg_get_userbyid(p.proowner)
  into v_transition_owner
  from pg_catalog.pg_proc p
  where p.pronamespace = to_regnamespace('private')
    and p.proname = 'transition_truck_live'
    and p.pronargs = 12;

  if v_guc <> 'on'
    or v_transition_owner is null
    or current_user <> v_transition_owner
  then
    raise exception 'An open truck location must change through the canonical LIVE transition'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function private.guard_open_truck_location() is
'Blocks direct insert/update/delete of an open truck canonical location except from the private canonical transition, or from private.bridge_legacy_open_truck_location''s narrowly-scoped TEMPORARY legacy-compatibility exemption (see 20260724000000_legacy_live_compatibility_bridge.sql).';

revoke all on function private.guard_open_truck_location() from public;
revoke all on function private.guard_open_truck_location() from anon;
revoke all on function private.guard_open_truck_location() from authenticated;

-- ============================================================
-- 5. truck_live_events: no new trigger needed here. Item 3's requirement --
--    "the legacy client's follow-up insert must not create a duplicate
--    audit row" -- is already fully satisfied by
--    20260718020000_hands_free_live_scheduled_automation.sql's existing
--    revoke of authenticated's direct INSERT on this table, deliberately
--    left untouched. See the design-tradeoff note above this migration's
--    header for why a graceful trigger-based no-op was not built instead.
-- ============================================================
