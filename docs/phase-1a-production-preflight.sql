-- Phase 1A production preflight (read-only)
--
-- Run against production only through an explicitly read-only session.

-- Duplicate location rows violate the one-current-location-per-truck
-- assumption used by canonical Go LIVE.
select
  truck_id,
  count(*) as location_row_count
from public.locations
group by truck_id
having count(*) > 1;

-- Pre-Trust-Engine LIVE rows with neither an expiry nor a freshness fallback.
-- This explicit conjunction is required: NULL comparisons do not become true.
-- Before rollout, this result is the state-selected candidate set handled by
-- 20260718070000_repair_legacy_live_freshness.sql; review its count and state.
-- After that migration, rerun this query and require an empty result.
select
  id,
  updated_at,
  live_started_at,
  last_live_updated_at,
  live_expires_at,
  live_source
from public.trucks
where is_open is true
  and last_live_updated_at is null
  and live_expires_at is null
order by id;

-- Preview the exact bounded anchor and expected migration outcome without
-- changing data. An anchor older than 12 hours will close canonically during
-- the migration; a newer anchor remains open only until planned_expires_at.
with legacy_candidates as (
  select
    t.id,
    least(
      coalesce(
        greatest(
          t.live_started_at,
          last_go_live.created_at,
          t.updated_at
        ),
        statement_timestamp()
      ),
      statement_timestamp()
    ) as planned_freshness_at
  from public.trucks t
  left join lateral (
    select max(e.created_at) as created_at
    from public.truck_live_events e
    where e.truck_id = t.id
      and e.action = 'go_live'
  ) last_go_live on true
  where t.is_open is true
    and t.last_live_updated_at is null
    and t.live_expires_at is null
)
select
  id,
  planned_freshness_at,
  planned_freshness_at + interval '12 hours' as planned_expires_at,
  case
    when planned_freshness_at + interval '12 hours' < statement_timestamp()
      then 'canonical_close_during_migration'
    else 'bounded_open_until_expiry'
  end as planned_outcome
from legacy_candidates
order by id;
