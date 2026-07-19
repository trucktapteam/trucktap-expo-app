# Trust Engine

## Purpose

The Trust Engine keeps TruckTap's LIVE badge truthful: LIVE state changes are
atomic and auditable, and stale state resolves closed. Its product philosophy
is simple:

> TruckTap assists. Owners stay in control.

The database has one private canonical transition,
`private.transition_truck_live`, shared by authenticated owner RPCs and
internal cleanup/automation paths. Clients cannot execute it directly. A
database guard rejects direct updates to `is_open`, the LIVE timestamps/source,
and `live_stop_id`, so owners and admins cannot bypass the transition or forge
session ownership with a table update.

## Canonical LIVE transition

`public.go_live_truck` retains its existing signature and owner/admin
authorization boundary. It delegates to the private transition, which performs
the following in one database transaction:

1. Locks the truck row.
2. Upserts the canonical `locations` row.
3. Sets the truck's LIVE timestamps/source and `is_open = true`.
4. Sets `live_stop_id` only for an internal scheduled-stop start. An
   owner-initiated/manual Go LIVE clears `live_stop_id`.
5. Inserts the matching `truck_live_events` audit row.

An automatic scheduled start never replaces a truck that is already LIVE.
This is the first "manual always wins" boundary.

Caller-provided source labels on the public owner RPC are untrusted. The
canonical source for every owner/admin `go_live_truck` call is `manual`; the
requested label is retained only as explicitly untrusted audit metadata.

Direct `locations` writes remain available while a truck is offline. Once the
truck is open, a trigger permits location insert/update/delete only from the
private canonical transition. This prevents owners from moving an active
customer-facing LIVE marker without the matching canonical state and audit
transaction.

## Canonical OFFLINE transition and session ownership

`public.go_offline_truck` also retains its existing signature and owner/admin
checks. Every successful offline transition clears `live_stop_id` and writes
the audit row atomically. Its caller-provided source is also untrusted and is
normalized to canonical `manual`. Trusted `schedule`, `expiration`, and
`archive` sources are reserved for private/server-controlled paths.
The current owner Archive flow remains functionally compatible but is audited
as `manual` until a dedicated controlled archive transition exists.

`trucks.live_stop_id` is the owner of an automated LIVE session. A future
scheduled end passes its stop ID as an expected owner:

- If `live_stop_id` still matches, it may close the truck.
- If the owner manually went LIVE, went offline, or another stop owns the
  session, the transition returns a structured no-op and changes nothing.

This compare-and-set contract prevents an old stop from closing a newer manual
or scheduled session. The primitive rejects construction of an unconditional
schedule-sourced end: it requires a non-null expected `live_stop_id`, a
non-null expected `live_started_at`, and restart matching enabled. Valid stale
work remains distinguishable as `live_stop_mismatch`,
`live_session_restarted`, or `already_offline`.

## Stale cleanup

`public.close_stale_open_trucks()` now delegates each expiration to the same
private transition. It also passes the candidate session's `live_started_at`.
If an owner restarts LIVE between the candidate scan and the locked transition,
the timestamp no longer matches and cleanup returns a safe no-op. A later pass
can reassess the current state.

The former client-side stale auto-close call was removed because it used the
unconditional owner RPC and could race with a newly restarted session. Database
cleanup is now the only expiration writer.

Each stale candidate runs inside its own PL/pgSQL exception block. If one
transition raises, that candidate's subtransaction rolls back, a sanitized
warning records its truck ID and SQLSTATE, and cleanup continues. Successful
closes before and after the failure remain part of the successful top-level
call. A failed candidate remains unchanged and receives no misleading
`go_offline` event.

`live_expires_at` remains the primary stale signal, with
`last_live_updated_at` as the legacy 12-hour fallback. General
`trucks.updated_at` is not a LIVE freshness signal.

Future scheduled-start processing must treat the canonical `already_live`
result as a recheck/retry condition before resolving the start. A previous
stop's end may be concurrently committing. The retry must be bounded, short,
and idempotent; it must re-read current `live_stop_id` and `live_started_at`
before retrying and must never replace or override a manual LIVE session.

## Scheduled-stop automation foundation

Hands-Free LIVE is opt-in per explicitly created `upcoming_stops` row and
defaults off. An enabled row must have:

- `status = 'scheduled'`;
- an end after its start;
- a nonblank display location;
- finite coordinates in valid latitude/longitude ranges;
- a valid IANA timezone from PostgreSQL's timezone catalog; and
- a future start whenever a relevant armed-stop edit occurs before automatic
  start resolves.

The future-start rule is lifecycle-aware trigger logic, not a
wall-clock-dependent permanent `CHECK`. Before start resolution, owners may
edit the automation window only while the complete contract remains valid and
the start remains future. Once `auto_start_resolved_at` or
`auto_live_started_at` is populated, Phase 1A freezes both `starts_at` and
`ends_at` to avoid an ambiguous post-start window.

If an open truck's `live_stop_id` points to a stop, that stop cannot be
deleted, disabled, moved to another truck, or changed to any automation-
ineligible status (`delayed`, `cancelled`, `sold_out`, or `completed`). The
owner must first go offline. Phase 1B needs a controlled cancellation RPC that
locks both rows, closes only the matching session, updates the stop, and writes
explicit cancellation audit metadata atomically.

All automation configuration and lifecycle fields are hidden from public stop
reads and are not directly client-writable. The scheduled-automation layer
adds controlled owner RPCs for opt-in, safe status reads, and confirmation
notification preferences. Owners see human-readable outcomes rather than raw
lifecycle columns.

## Scheduled processor

The service-role-only scheduled processor delegates every LIVE change to
`private.transition_truck_live`. It processes scheduled ends before starts,
uses deterministic bounded batches and row locks, and takes a transaction
advisory lock so duplicate cron invocations cannot duplicate transitions.

Back-to-back stops close the exact prior owned session before the next start is
considered. True overlaps use first-owner-wins behavior. A later stop may
briefly retry only when the current scheduled owner's end is within the
configured bounded retry window. A manual LIVE collision is also rechecked,
but only until the already-configured start grace expires. Neither retry path
ever replaces a manual session, and overlap behavior remains first-owner-wins.

Missed scheduler executions are recovered from persisted state. Starts are
allowed only inside the configured start grace and before the stop ends. Due
ends remain eligible regardless of lateness and retain both stop ownership and
session restart compare-and-set checks.

Each candidate has its own exception block. A failure rolls back only that
candidate, records a private operational diagnostic, and leaves it unresolved
for a later safe retry. Successful transitions alone create
`truck_live_events` rows with `source = 'schedule'`.

The global kill switch blocks new starts but continues due ends for sessions
that automation already owns. Authenticated clients cannot insert
`truck_live_events` directly; audit events are canonical server output.

Optional owner confirmation pushes are triggered only from committed schedule
audit events. They use a dedicated Vault-backed webhook secret and an
attempt-aware delivery claim. Claims stuck in `processing` for more than two
minutes are swept to an observable failed state and may be reclaimed by a
replayed event. Attempt compare-and-set prevents a late prior attempt from
overwriting its retry. Push delivery is best-effort and can never roll back or
impersonate a LIVE transition.

## Explicit non-goals

Hands-Free LIVE is automatic scheduled start/stop only:

- no auto-pause;
- no auto-resume;
- no auto-announcements; and
- no Operating Hours automation.

Operating Hours remain display/configuration data and never trigger LIVE state.

## Audit and closed-safe guarantees

Every successful canonical LIVE/OFFLINE transition updates state and inserts
one `truck_live_events` row in the same transaction. Expected-session failures
return a no-op and create no misleading audit event.

When TruckTap cannot prove that an automated action owns the current session,
it does not mutate that session. Stale cleanup remains the closed-safe fallback
for genuinely abandoned LIVE state.
