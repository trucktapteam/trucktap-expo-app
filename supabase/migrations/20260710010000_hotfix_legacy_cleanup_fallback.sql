-- EMERGENCY PRODUCTION HOTFIX
--
-- Applied directly to production on July 21, 2026 in response to the
-- F-Bomb forced-offline incident: the currently-released production owner
-- client successfully sets is_open = true and refreshes updated_at on Go
-- LIVE, but never refreshes live_started_at / last_live_updated_at /
-- live_expires_at. As a result, this cleanup was closing legitimately,
-- freshly-opened trucks at the very next 15-minute cron run.
--
-- This migration exists solely to bring the repository into sync with what
-- is already running in production. It is a straight capture of the exact
-- CREATE OR REPLACE FUNCTION currently deployed, fetched directly from
-- production via pg_get_functiondef -- no logic has been added, changed,
-- or "improved" here. The full rationale is embedded in the function's own
-- body comment below, exactly as it exists in production.
--
-- This is TEMPORARY legacy-client compatibility, not permanent Trust
-- Engine logic. Remove it once the permanent compatibility bridge and the
-- TruckTap 2.0 rollout are complete and no production owner client still
-- exercises the legacy Go LIVE path that never refreshes the three
-- lifecycle timestamp columns.
--
-- Placement note: this file is intentionally versioned 20260710010000, not
-- 20260721000000, for two reasons -- 20260721000000_secure_truck_creation.sql
-- already exists in this repository, and this hotfix must sort before
-- 20260717000000_owner_release_policy.sql and, critically, before
-- 20260718000000_hands_free_live_phase_1a.sql, which redefines this same
-- function as the permanent fix. Sorting after that migration would let a
-- future full deployment reapply this temporary hotfix on top of the
-- permanent one, regressing it. 20260710010000 sorts immediately after
-- 20260710000000_notify_owner_message_on_insert.sql, the last migration
-- actually applied to production before this hotfix was made -- the exact
-- point in the tracked history where production's real function definition
-- diverged from what this repository had on file.

CREATE OR REPLACE FUNCTION public.close_stale_open_trucks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stale_window interval := interval '12 hours';
  closed_count integer := 0;
begin
  /*
    Trust rule:
    stale LIVE status resolves Closed, not Open.

    LIVE freshness is tracked on public.trucks LIVE-specific fields. General
    truck edits update public.trucks.updated_at, so updated_at is intentionally
    not used as the stale LIVE signal.

    ============================================================
    TEMPORARY LEGACY-CLIENT COMPATIBILITY FALLBACK
    Added: July 21, 2026, for the F-Bomb forced-offline incident.
    The currently-released production owner client successfully sets
    is_open = true and refreshes updated_at on Go LIVE, but does not
    refresh live_started_at / last_live_updated_at / live_expires_at.
    As a result, this cleanup previously closed legitimately-freshly-opened
    trucks at the very next 15-minute cron run.
    This fallback treats a recent updated_at as a secondary freshness
    signal ONLY on the null-expiry branch below -- it never overrides or
    weakens the live_expires_at < now() expiration path, which remains
    fully in force for any truck using the canonical LIVE RPC lifecycle.
    REMOVE this fallback once all production owner clients are confirmed
    to be using the canonical go_live_truck RPC lifecycle, which correctly
    refreshes all three fields on every Go LIVE.
    Not intended as permanent Trust Engine logic.
    ============================================================
  */
  with closed as (
    update public.trucks t
    set
      is_open = false,
      live_expires_at = null,
      live_source = 'expiration',
      updated_at = now()
    where t.is_open is true
      and (
        t.live_expires_at < now()
        or (
          t.live_expires_at is null
          and (
            t.last_live_updated_at is null
            or t.last_live_updated_at < now() - stale_window
          )
          and t.updated_at < now() - stale_window
        )
      )
    returning t.id
  ),
  audit as (
    insert into public.truck_live_events (
      truck_id,
      action,
      source,
      actor_user_id,
      location_label,
      metadata
    )
    select
      c.id,
      'go_offline',
      'expiration',
      null,
      l.label,
      jsonb_build_object(
        'closed_by', 'close_stale_open_trucks',
        'stale_window_hours', 12
      )
    from closed c
    left join lateral (
      select label
      from public.locations
      where truck_id::text = c.id::text
      limit 1
    ) l on true
    returning 1
  )
    -- Count the audit rows so the insert remains an explicit part of the function result.
    select count(*) into closed_count
    from audit;

  return closed_count;
end;
$function$
;
