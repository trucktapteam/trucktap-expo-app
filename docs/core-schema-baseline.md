# Core schema baseline

## Purpose

Migration `20260430000000_core_schema_baseline.sql` captures the public tables
that existed before TruckTap's version-controlled migration history. A
profiles-only migration was not sufficient: the first existing migrations
also require trucks, favorites, reviews, locations, sightings, analytics,
notification logs, and check-ins.

The baseline was derived from a read-only production schema dump on
2026-07-19 and reconciled with every later migration. It contains no production
data, project linkage, webhook credential, or secret.

## Profiles contract

The baseline preserves the production profile columns, defaults, primary key,
unique email constraint, Auth user foreign key, optional truck foreign key,
RLS policies, and signup behavior.

Production has no standalone profile indexes beyond the indexes backing
`profiles_pkey` and `profiles_email_key`; the baseline preserves that shape.

`public.handle_new_user()` still creates:

- the new Auth user's ID and email;
- role `customer`;
- a display name derived from the email portion before `@`.

`auth.users.on_auth_user_created` remains an `AFTER INSERT` row trigger. The
function's former mutable `public` search path and public execution grants were
clear security defects, so the baseline pins `search_path` to `pg_catalog`,
fully qualifies the profile table, and revokes direct execution from API
roles. Trigger behavior is unchanged.

The production tables had `ALL` grants for anon and authenticated, including
operations such as `TRUNCATE`, `REFERENCES`, and `TRIGGER` that the application
does not use and RLS does not meaningfully justify. The baseline grants only
the DML operations supported by the existing policies. Service role retains
full table access. At this point in the migration chain, `profiles` still
grants full-column `SELECT` to `anon` and `authenticated`; a later migration
narrows that boundary (see docs/profile-data-exposure.md).

## Migration ownership

The baseline owns only objects that must predate
`20260430220000_owner_feedback_notifications.sql`. Objects introduced or
replaced by later migrations are deliberately not duplicated. In particular,
the baseline does not own notification webhook triggers, release-policy
objects, LIVE transition functions, scheduled automation, or later analytics
owner policies.

Production migration history confirms that
`20260709001000_schedule_stale_open_truck_cleanup.sql` is already applied.
Its committed text is therefore preserved byte-for-byte. That migration
assumes pg_cron exists, so the new baseline declares pg_cron as a foundational
fresh-bootstrap prerequisite instead of rewriting applied history.

Production migration history confirms that
`20260718050000_reconcile_owner_message_deliveries.sql` is not yet applied.
Its catalog-guarded scheduler block is retained: it preserves the job name,
schedule, and command when pg_cron exists and safely leaves the processor
unscheduled when it does not.

Migration `20260719000000_harden_core_schema_boundaries.sql` is the forward
reconciliation path for an existing deployment. It repeats only the
least-privilege grants and hardened signup function/trigger, allowing the
historical baseline to be recorded as already represented instead of replayed.

A further migration, `20260719010000_restrict_profile_data_exposure.sql`,
narrows profile-column exposure beyond what this baseline and its forward
reconciliation grant. That migration is independently gated behind its own
production blocker; see docs/profile-data-exposure.md for its scope,
validation, and rollout conditions.

## Validation

`supabase/tests/core_schema_baseline.sql` verifies the reapplied baseline plus
forward hardening:

- reapplying the baseline does not duplicate objects;
- the signup trigger exists exactly once;
- signup creates the expected customer profile;
- the function is SECURITY DEFINER with a pinned search path;
- API roles cannot execute the trigger function;
- profile policies, constraints, and indexes exist once;
- an authenticated user can update their own ordinary profile data;
- the same user cannot update another profile.

That same file also asserts the final profile column-exposure boundary,
because it replays the full migration chain (baseline, forward hardening, and
the profile-exposure restriction) to validate cumulative idempotency and
end state together. It cannot pass without
`20260719010000_restrict_profile_data_exposure.sql` applied, so it is
committed together with that migration rather than with this baseline. The
privacy migration's dedicated behavioral security tests live in
`supabase/tests/profile_data_exposure.sql`; see docs/profile-data-exposure.md.

All database tests run inside transactions and roll back their fixtures.

Storage buckets and Storage policies were not included in this baseline. They
are not required for Auth signup or the relational migration chain, and their
authoritative production definitions were not part of the requested
public-schema evidence. They should not be reconstructed by inference.

## Rollout

1. Run a read-only production comparison for table columns, constraints,
   indexes, policies, grants, `handle_new_user()`, and
   `on_auth_user_created`.
2. Resolve any unexpected drift before applying anything.
3. On a fresh database, apply every migration strictly in filename order,
   beginning with `20260430000000_core_schema_baseline.sql`.
4. On the existing production database, record the historical baseline version
   as applied only after the read-only comparison proves its objects are
   already present. Do not replay the table-creation baseline.
5. Apply pending forward migrations in filename order through
   `20260719000000_harden_core_schema_boundaries.sql`. Do **not** apply
   `20260719010000_restrict_profile_data_exposure.sql` in this pass; it has
   its own independently gated rollout. See docs/profile-data-exposure.md.
6. Create a controlled test signup and verify one matching customer profile.
7. Verify the profile trigger count, policies, grants, and function
   `search_path`.
8. Run the complete database regression suite for the migrations actually
   applied.

For an existing production database, the baseline's guarded object creation is
a no-op for matching objects. Its intentional changes are the least-privilege
grant reduction and the trigger-function hardening described above.
