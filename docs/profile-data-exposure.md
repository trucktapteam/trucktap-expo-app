# Profile data exposure restriction

## Purpose

`20260719010000_restrict_profile_data_exposure.sql` corrects the misleading
production profile boundary. The historical production policy
`Public can read basic profile info` uses `USING (true)`, so every profile row
remains available for public attribution and RLS cannot filter columns. This
migration enforces the real boundary with column grants instead: `anon` and
`authenticated` retain direct `SELECT` only on `id`, `display_name`, and
`profile_photo`. Requests for email, role, truck ownership, push data, or
notification settings now fail at the SQL privilege boundary rather than
silently returning.

Authenticated users read their own private account fields through
`get_private_profile(uuid)`; the same RPC permits cross-profile access only
for an authenticated `admin`. Existing self-update RLS and service-role access
are unchanged.

## Production deployment blocker

**This migration must not be applied to production until a true app-wide
minimum-version gate is enforced** — a mechanism that actively rejects
authenticated requests from any client build older than the first build
containing `fetchPrivateProfile()` (`lib/privateProfile.ts`), for **every**
authenticated role, customers included, not only truck owners and admins.
Confirming that a compatible build has been released to both stores is not
sufficient by itself: this migration has no server-side grace period and no
reverse fallback, so any session still running an older build — a cached
login, a device that has not relaunched the app, a staged store rollout that
has not reached every user — fails hard the moment this migration is applied.
A verified-adoption argument, without an active rejecting gate, is not an
acceptable substitute for that gate.

`fetchPrivateProfile()` is forward-compatible only: it calls
`get_private_profile()` first and falls back to the legacy direct table read
solely when the RPC does not exist yet (pre-migration backend). There is no
reverse fallback. A pre-`fetchPrivateProfile()` client build has no path to
`get_private_profile()` and will error on every profile read once this
migration lands.

**This is not covered by `docs/owner-release-policy.md`.** That gate
(`private.require_supported_owner_client`) is wired only into
`go_live_truck`, `go_offline_truck`, and a generic `BEFORE INSERT OR UPDATE OR
DELETE` trigger on `trucks`, `locations`, `upcoming_stops`, `review_replies`,
and `profiles`. Two properties make it irrelevant to this migration's risk:

1. It is a write-side trigger. Postgres triggers cannot fire on `SELECT`, and
   the risk here is entirely a `SELECT`/read restriction.
2. It explicitly exempts every non-owner: `require_supported_owner_client`
   returns immediately (no check at all) whenever the caller's
   `profiles.role` is not `truck`, `owner`, or `admin`. Ordinary customers
   reading their own favorites/notification preferences are `customer` role
   and are never gated, on any table, for any reason.

Enabling the owner gate provides **zero** protection for this migration, for
any user, on any operation. Do not treat "the owner gate is enabled" as
sufficient justification to apply this migration.

Required before applying `20260719010000_restrict_profile_data_exposure.sql`
to production:

1. A separately reviewed, app-wide minimum-version gate that covers ordinary
   authenticated profile reads for every role — not only
   `truck`/`owner`/`admin` management actions — is designed, deployed, and
   confirmed active; and
2. The gate's minimum version is set at or above the first build containing
   `fetchPrivateProfile()`.

Until both are true, this migration must remain unapplied in production even
if every other migration in this repository has already been applied.
`docs/critical-release-remediation-runbook.md` does not yet sequence this
migration; it must be added there with an explicit, verified minimum-version
gate checkpoint before production execution.

## Validation

`supabase/tests/profile_data_exposure.sql` verifies:

- `anon`/`authenticated` column grants are limited to `id`, `display_name`,
  and `profile_photo`;
- `get_private_profile(uuid)` execution is limited to `authenticated`;
- anon retains public attribution row visibility;
- anon and authenticated direct reads of a private column (`email`, `role`,
  `push_token`, ...) are rejected;
- an authenticated user retains private self-read through the RPC and cannot
  use it for another user's profile;
- an authenticated user's ordinary self-update remains visible through the
  RPC;
- an `owner`-role user gains no unrelated private-profile access; and
- an `admin`-role user retains authorized private-profile access.

`supabase/tests/core_schema_baseline.sql` also asserts this migration's final
column-grant shape, because it replays the full migration chain (baseline,
forward hardening, and this restriction) to validate cumulative idempotency
and end state together; see docs/core-schema-baseline.md.

All database tests run inside transactions and roll back their fixtures.

## Rollout

1. Confirm the app-wide minimum-version gate described above is designed,
   deployed, and active, with its minimum version at or above the first
   `fetchPrivateProfile()` build.
2. Add this migration to `docs/critical-release-remediation-runbook.md`'s
   production execution order, with that gate confirmation as an explicit
   checkpoint.
3. Apply only `20260719010000_restrict_profile_data_exposure.sql`.
4. Run the profile data-exposure and core schema baseline regression suites
   against production-shaped data.
5. Confirm a pre-gate client build is rejected before any profile data is
   returned, and that a compatible build's normal profile reads/updates still
   succeed.
