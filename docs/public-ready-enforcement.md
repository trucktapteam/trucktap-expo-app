# Public Ready enforcement

## Source of truth

`constants/publicReady.ts` owns the complete timing policy:

- `newTruckBioRequiredAt` is the creation-cohort boundary. Trucks created at or
  after it require a bio immediately.
- `legacyTruckBioEnforcementAt` controls whether the older cohort eventually
  loses its bio grandfathering. `null` disables that enforcement.

The two settings are intentionally separate. Advancing the new-truck cohort
must never silently schedule existing trucks to disappear.

## Current behavior

Legacy enforcement is disabled. A truck created before
`newTruckBioRequiredAt`, or one whose creation time is missing or invalid,
continues to use the existing Public Ready visibility requirements: name, logo,
and hero image. A missing bio remains a non-blocking owner recommendation.

Trucks created at or after `newTruckBioRequiredAt` require name, logo, hero
image, and bio. The definition and ordering of those Public Ready requirements
remain in `lib/truckPublicReady.ts`.

The broader owner/admin profile coaching status remains separate. Service area,
menu, hours, and other coaching signals do not become customer-visibility
requirements.

## Safely enabling legacy enforcement later

1. Measure legacy trucks missing a bio and contact affected owners.
2. Select a future UTC timestamp with enough owner notice.
3. Set `legacyTruckBioEnforcementAt` to that timestamp; do not change
   `newTruckBioRequiredAt`.
4. Run the Public Ready boundary tests and the full client validation suite.
5. Release the client containing the scheduled policy before the timestamp.
6. Confirm adequate mobile adoption. Because customer filtering currently
   occurs in the client, old app versions will retain their bundled policy.
7. Verify owners and admins can still access incomplete trucks while ordinary
   customers cannot after the timestamp.
8. Monitor customer-visible truck counts and owner completion funnels at the
   boundary.

For authoritative enforcement across every installed client version, add a
separately reviewed server-side visibility boundary before enabling the date.
Do not rely on a new mobile bundle alone if old clients must enforce the cutoff.
