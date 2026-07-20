# Owner release policy

## Purpose

TruckTap keeps customer discovery available while requiring a compatible
native build for owner-management actions. This is permanent release
infrastructure, not a temporary Hands-Free LIVE exception.

**This document describes one scope (`owner_management`) of the general
client compatibility system in `docs/client-compatibility-policy.md`.**
`private.owner_release_policy` (described below) is preserved unmodified as
a rollback anchor; the live configuration and enforcement described in this
document now live in `private.client_compatibility_policy` under
`scope = 'owner_management'`, and `private.require_supported_owner_client()`
is a one-line wrapper around the generalized
`private.require_supported_client('owner_management', ...)`. Every RPC name,
signature, and error string described below is unchanged. Read this
document for owner-management specifics; read
`docs/client-compatibility-policy.md` for how new protected RPCs (such as
`get_private_profile()`, gated separately under the `private_data` scope)
plug into the same system without duplicating this logic.

The database remains authoritative. Client build headers improve compatibility
decisions and operator visibility, but they never authenticate a user, prove
ownership, or grant authorization.

## Policy

`private.owner_release_policy` contains one row with independent Android and
iOS minimum native builds, direct store URLs, owner-gate state, and an
emergency owner-management pause.

Both enforcement controls default to `false`. Minimum builds and store URLs
default to `null`.

Clients read the safe projection through:

```sql
select * from public.get_owner_release_policy();
```

Only the admin-authorized `public.update_owner_release_policy` RPC changes the
policy during routine operation. It locks the singleton, validates the entire
resulting policy, updates it atomically, and appends immutable history to
`private.owner_release_policy_audit`.

Enforcement cannot be enabled unless both platform minimums and both direct
store listing URLs are present. Search-result URLs are rejected.

## Client release headers

Compatible clients send:

- `X-TruckTap-Platform`: `android`, `ios`, or `web`
- `X-TruckTap-Build`: positive native build integer
- `X-TruckTap-App-Version`: optional semantic display version

Web is centrally deployed and is not compared with native store build
minimums.

`private.require_supported_owner_client` validates these values for owner/admin
management requests. It runs in addition to authentication, ownership, RLS,
and canonical LIVE checks. It never replaces them.

The server distinguishes:

- `owner_update_required`
- `owner_management_paused`

The app presents both through the owner update screen. Customers, including an
owner choosing Browse Trucks, retain discovery access.

## Adoption observations

Compatible authenticated owner/admin clients call
`public.observe_owner_client_version()`. The function reads the validated
request headers and upserts one current record per authenticated user/platform
in `private.owner_client_versions`.

Each record contains:

- authenticated user ID;
- platform;
- native build;
- optional semantic version; and
- last-seen timestamp.

This is bounded current-state telemetry, not an unlimited event log. Customers
are excluded. Normal authenticated users cannot read the table. Future Admin
tooling may expose an authorized aggregate or report.

Observations are operational signals only. They are not authentication,
authorization, device attestation, or proof that a client is untampered.

## Admin policy update

The future Admin app should call the same RPC. Until then, an authenticated
admin may invoke it through an approved operator workflow:

```sql
select public.update_owner_release_policy(
  p_owner_gate_enabled := false,
  p_owner_management_paused := false,
  p_minimum_android_build := 53,
  p_minimum_ios_build := 23,
  p_android_store_url :=
    'https://play.google.com/store/apps/details?id=<production-package>',
  p_ios_store_url :=
    'https://apps.apple.com/<region>/app/<app-name>/id<production-id>',
  p_update_title := 'TruckTap has been upgraded!',
  p_update_message :=
    'Please install the latest version to manage your truck and use the new LIVE system.',
  p_reason := 'Prepare minimum versions; enforcement remains disabled'
);
```

The caller must be authenticated and have `profiles.role = 'admin'`.
Successful calls always append previous/resulting policy, actor, timestamp, and
the optional reason to the audit table.

## Safe activation sequence

1. Deploy the policy database objects with enforcement disabled.
2. Publish compatible Android and iOS clients.
3. Verify the exact direct store listings from real devices.
4. Wait until both approved builds are fully available; do not depend on
   staged store rollout.
5. Observe owner build adoption without blocking.
6. Populate both minimum builds and direct URLs while leaving the gate off.
7. Test the Update Now actions and emergency operator RPC.
8. Enable the owner gate against the current production-style LIVE backend.
9. Confirm an old build is rejected before any LIVE state or audit change.
10. Confirm current owners can Go LIVE/OFFLINE and customers can browse.
11. Apply Phase 1A only after the gate is proven.
12. Never lower either minimum below the first Phase 1A-compatible native
    build while Phase 1A remains deployed.

Hands-Free LIVE scheduled processing has its own disabled-by-default feature
flag and is enabled separately.

## Emergency response

Before Phase 1A, an admin can disable the owner gate or lower a platform
minimum.

After Phase 1A, never admit a pre-compatibility build. If the current native
release is defective:

1. Set `owner_management_paused = true` through the admin RPC.
2. Keep customer discovery available.
3. Keep incompatible owners blocked.
4. Publish a corrected native or compatible OTA release.
5. Update minimums if necessary.
6. Clear the pause only after controlled validation.

The admin update RPC deliberately remains callable during a pause, so operators
cannot lock themselves out of rollback.

## Trust Engine invariants

The release policy does not:

- weaken `guard_open_truck_location`;
- permit legacy client location writes for an open truck;
- bypass `private.transition_truck_live`;
- alter scheduled-stop ownership;
- make client headers trusted authorization claims; or
- allow an old stop to close a newer session.

Rejected owner transitions make no truck, location, or LIVE audit change.
