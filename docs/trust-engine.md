# Trust Engine

## Purpose

The Trust Engine is TruckTap's guarantee that a truck's LIVE badge reflects
reality: if a truck shows as LIVE to customers, that status change actually
happened, is auditable, and expires on its own if the owner goes silent.
It has three parts:

1. A single, canonical way to change LIVE status (the RPCs below).
2. An immutable audit log of every LIVE status change (`truck_live_events`).
3. A cron job that force-closes a truck if it goes stale, so "LIVE" never
   silently lies about a truck that stopped updating.

## Canonical LIVE flow (`goLive()` → `public.go_live_truck`)

`AppContext.goLive({ truckId, source, location })` is the only app-side
entry point for putting a truck LIVE. It calls the `go_live_truck(p_truck_id,
p_source, p_latitude, p_longitude, p_location_label, p_metadata)` Postgres
RPC, which in one transaction:

1. Verifies the caller owns the truck (`trucks.owner_id = auth.uid()`) or
   holds `profiles.role = 'admin'`. Anyone else gets an authorization error
   and no rows change.
2. Updates `trucks`: `is_open = true`, `live_started_at`, `last_live_updated_at`,
   `live_expires_at` (now + 12h), `live_source`, `updated_at`.
3. Inserts a `truck_live_events` row: `action = 'go_live'`, the real `source`
   the caller passed, `actor_user_id = auth.uid()`, and the location fields.

Because both the update and the insert are inside the RPC's single
transaction, one cannot happen without the other. Afterward, `goLive()`
separately upserts the truck's live coordinates into the `locations` table
(a distinct table that customer-facing map queries read from) and verifies
the save before updating local app state.

## Canonical OFFLINE flow (`goOffline()` → `public.go_offline_truck`)

`AppContext.goOffline({ truckId, source, updates? })` calls
`go_offline_truck(p_truck_id, p_source, p_metadata)`, which in one
transaction:

1. Verifies ownership/admin the same way `go_live_truck` does.
2. Updates `trucks`: `is_open = false`, `live_expires_at = null`,
   `live_source`, `updated_at`. It deliberately does **not** touch
   `last_live_updated_at` or `live_started_at` — those remain the historical
   record of the most recent LIVE session.
3. Inserts a `truck_live_events` row: `action = 'go_offline'`, the real
   `source`, `actor_user_id = auth.uid()`.

If the caller also passes `updates` (today, only the archive flow does —
`archived`, `archivedAt`, `archiveReason`), those are persisted with a
follow-up `updateTruckDetails()` call after the RPC succeeds. This keeps
`go_offline_truck` single-purpose (LIVE status only); archiving a truck is a
separate concern that happens to often occur alongside going offline.

## Cron expiration flow (`close_stale_open_trucks`)

Every 15 minutes, `public.close_stale_open_trucks()` (unchanged by this
work) finds trucks where `is_open = true` and `live_expires_at` has passed
(or, for legacy rows, `last_live_updated_at` is older than 12 hours), and in
one statement closes them (`is_open = false`, `live_source = 'expiration'`)
and inserts the matching `truck_live_events` row
(`action = 'go_offline'`, `source = 'expiration'`, `actor_user_id = null`).
This is the reference implementation the `go_live_truck` / `go_offline_truck`
RPCs were built to match: update and audit insert in the same transaction,
so a stale close can never happen without leaving a trace.

## Why `trucks.updated_at` is NOT a LIVE freshness signal

`updated_at` is a generic "something on this truck changed" timestamp. It is
set on every truck write — menu edits, gallery uploads, operating hours,
profile edits, archiving — not just LIVE status changes. There is no
database trigger that manages it; every write path that touches `trucks`
sets it explicitly. Because of this, `updated_at` cannot tell you whether a
truck is still genuinely LIVE — a truck could have `is_open = true` from six
hours ago and still get its `updated_at` bumped a minute ago by an unrelated
menu edit. LIVE freshness is tracked on dedicated columns instead (below).

## Purpose of the dedicated LIVE columns

- **`last_live_updated_at`** — the last time the truck's LIVE status was
  confirmed fresh (set on go-live, left untouched on go-offline). This is
  the legacy fallback signal `close_stale_open_trucks` uses for rows that
  predate `live_expires_at`.
- **`live_started_at`** — when the current or most recent LIVE session
  began. Historical; not touched by going offline.
- **`live_expires_at`** — when the current LIVE session should auto-expire
  if untouched. Set to 12 hours out on go-live, cleared (`null`) on
  go-offline. This is the primary signal `close_stale_open_trucks` checks.
- **`live_source`** — what caused the most recent LIVE status change:
  `manual`, `schedule`, `nudge_confirmation`, `expiration`, or `archive`.

## Audit guarantees

Every LIVE status change — go-live, go-offline, or cron expiration — writes
exactly one row to `truck_live_events` with the real `source` and, for
app-triggered changes, the real `actor_user_id`. Because the update and the
insert happen inside a single Postgres transaction (either the RPC body or
the cron function's CTE), there is no code path where a truck's `is_open`
changes without a corresponding audit row, and no code path where a
`truck_live_events` row is written without the corresponding state change.
`truck_live_events` is protected by RLS: a truck's owner and admins can read
its rows; only the owner, an admin, or a `SECURITY DEFINER` function
(`close_stale_open_trucks`, `go_live_truck`, `go_offline_truck`) can write to
it.

## Why all LIVE state changes now flow through the RPCs

Before this change, `goLive()`/`goOffline()` performed the `trucks` update
and the `truck_live_events` insert as two independent client-issued network
calls. The insert's failure was swallowed (logged, not thrown), so a
transient network error could change a truck's LIVE status with no audit
trail — silently breaking the guarantee this whole system exists to provide.
Routing both operations through `go_live_truck` / `go_offline_truck` closes
that gap: the two writes are now one atomic unit, so they always succeed or
fail together, exactly like `close_stale_open_trucks` already did.
