# Client compatibility policy

## Purpose

TruckTap's minimum-supported-client enforcement is a single, reusable
system: `private.client_compatibility_policy`, keyed by `scope`, plus one
gate function, `private.require_supported_client(p_scope, p_action)`, that
any protected RPC calls. The owner-management gate
(`docs/owner-release-policy.md`) is one scope of this system, not a
separate mechanism.

This generalizes the owner-only release policy that shipped first. That
gate is a write-side trigger scoped to `truck`/`owner`/`admin` roles only —
Postgres triggers cannot fire on `SELECT`, and the role filter explicitly
skips every customer. It provides no protection for a read-only RPC like
`get_private_profile()`. `docs/profile-data-exposure.md` documents why that
gap blocked the profile privacy migration. This system closes it with a
`private_data` scope that applies to every authenticated role.

## Scopes

| scope | applies to | enforces | seeded state |
|---|---|---|---|
| `owner_management` | `truck`, `owner`, `admin` only | writes: `go_live_truck`, `go_offline_truck`, and inserts/updates/deletes on `trucks`, `locations`, `upcoming_stops`, `review_replies`, `profiles` | migrated forward from whatever `private.owner_release_policy` already had configured |
| `private_data` | every authenticated role (no role filter) | reads: `get_private_profile()`, and any future `get_private_*` RPC | disabled, no minimums, seeded fresh |

Adding a new protected scope means inserting one row into
`private.client_compatibility_policy` and calling
`private.require_supported_client('your_scope', 'your_action')` as the
first line of the RPC after its own authentication check. No new
header-parsing or build-comparison logic is ever written per scope.

## How the gate function works

`private.require_supported_client(p_scope, p_action)`:

1. Unauthenticated callers (`auth.uid() is null`) are skipped — the calling
   RPC's own authentication check is authoritative.
2. The scope's policy row is read. A missing row fails closed (raises
   `TRUCKTAP_<SCOPE>_UNAVAILABLE`) rather than silently allowing the call —
   a missing seed is a bug, never a bypass.
3. If the policy restricts specific roles (`applies_to_roles is not null`),
   the caller's `profiles.role` is looked up and non-matching roles are
   skipped. `private_data` has no role restriction, so this lookup is
   skipped entirely for it — every role reaches the build check.
4. `paused` takes precedence over everything else.
5. A disabled scope (`enabled = false`) always allows.
6. Platform/build come from the same `X-TruckTap-Platform` /
   `X-TruckTap-Build` / `X-TruckTap-App-Version` headers the owner gate
   already used, parsed once by `private.current_client_release()`.
7. `web` is exempt from the build comparison for every scope (see below).
8. Missing, invalid, or below-minimum builds raise
   `TRUCKTAP_<SCOPE>_UPDATE_REQUIRED`.

The `owner_management` scope is special-cased to emit its two original,
irregular error strings (`owner_update_required`, `owner_management_paused`)
byte-for-byte, because already-installed owner clients parse them. Every
other scope's error strings are derived directly from the scope name
(`<scope>_update_required`, `<scope>_paused`).

Headers are self-reported by the client and are never treated as an
authorization or authentication claim — this gate runs in addition to RLS,
ownership checks, and RPC-level authorization, never in place of them.

## Web

`web` is exempt from the build-number comparison for every scope,
unconditionally. This is a deliberate, bounded exception, not an oversight:

- GitHub Pages redeploys atomically on every push to `main`; every new page
  load gets the current release automatically, with no store review delay.
- The residual risk is an already-open browser tab running a stale bundle.
  For `private_data` specifically, this is already fully contained one
  layer down: the column-grant revoke in
  `20260719010000_restrict_profile_data_exposure.sql` rejects private-column
  selects unconditionally, regardless of any gate. A stale tab gets a hard
  `42501` on its next request — never a data leak, only an abrupt error that
  self-heals on reload.

No client-side polling or forced-reload mechanism is implemented for web;
the cost isn't justified given the underlying data grant already prevents
the only outcome that would matter.

## Client-side behavior (Option A: no full-app block)

Customers on an incompatible build keep using functionality that does not
depend on a protected RPC — discovery, favorites, browsing. Only the
specific screens that read protected data show the blocking experience,
via `PrivateDataGate` (`components/PrivateDataGate.tsx`), wrapped around:

- the authenticated identity card in `(customer)/(tabs)/profile.tsx`
- the notification-preferences section in `(customer)/settings.tsx`

`AppContext`'s auth-bootstrap flow already calls `fetchPrivateProfile()` for
every authenticated session regardless of role (to populate `currentUser`),
so a `private_data` restriction surfaces almost immediately after
login/session-restore via `emitClientRestriction`, without any new
root-layout check. `owner_management` keeps its existing full-screen block
in `(truck)/_layout.tsx`, unchanged, since every screen under `(truck)/...`
depends on owner-management actions.

**A full-app block for `private_data` is a supported follow-up UX policy
change, not an architectural one.** It would only mean wiring
`accessByScope['private_data']` into a root-layout redirect the same way
`ownerAccess` already is — no schema, RPC, or gate-function change.

## Admin management

`public.update_client_compatibility_policy(p_scope, ...)` manages any
scope's enforcement, minimums, store URLs, and copy, atomically, with an
audit row per change in `private.client_compatibility_policy_audit`.
`public.update_owner_release_policy(...)` remains callable with its
original signature and return shape for existing operator tooling; it
delegates to the generalized RPC with `p_scope := 'owner_management'`.

There is no in-app admin UI for this today (matching
`docs/owner-release-policy.md`'s existing operator-run-SQL model); the
schema supports one trivially in the future.

## Safe activation sequence for a new scope

Identical to the owner gate's proven sequence
(`docs/owner-release-policy.md`), generalized:

1. Deploy the scope's policy row disabled (already true for `private_data`).
2. Publish a compatible client to both stores.
3. Confirm both listings are live from real devices.
4. Populate minimums and direct store URLs while enforcement stays off.
5. Enable the scope.
6. Confirm a pre-compatible build is rejected before any protected data
   returns, and that a compatible build's normal reads still succeed.

## Rollback

`private.owner_release_policy`, `private.owner_release_policy_audit`, and
`private.owner_client_versions` are left in place, untouched, as a rollback
anchor — this migration is purely additive. They no longer receive new
writes; `private.client_compatibility_policy_audit` is the audit trail for
all scopes, including `owner_management`, going forward. Removing the old
tables is a deferred cleanup migration, only after the generalized system
is proven in production, not part of this change.
