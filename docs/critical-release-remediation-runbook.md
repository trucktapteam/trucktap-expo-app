# Critical release remediation: remaining production actions

This document separates completed repository work from production-only work.
Nothing in this sequence has been deployed by the repository remediation pass.
Never print, select, log, or commit a secret value.

## Repository prerequisites

The release checkout must contain all four focused remediation commits:

1. profile authorization-role guard and adversarial SQL test;
2. notification invocation authentication and secure trigger migration;
3. fresh, configured GitHub Pages artifact enforcement; and
4. this production runbook.

Before any production action, require a clean checkout, `git diff --check`, all
local tests, and an explicit confirmation that the Supabase project is
`spspobqzhdvsbeefecby`.

## Required names

- Edge Function secret: `DATABASE_NOTIFICATION_WEBHOOK_SECRET`
- Database Vault secret: `database_notification_webhook_secret`
- Existing favorite-open Edge secret:
  `FAVORITE_TRUCK_OPEN_WEBHOOK_SECRET`
- Existing favorite-open Vault secret:
  `favorite_truck_open_webhook_secret`
- GitHub repository variable: `EXPO_PUBLIC_SUPABASE_URL`
- GitHub Actions secret: `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- GitHub repository variable: `EXPO_PUBLIC_RORK_API_BASE_URL`
- GitHub Actions secret: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

Each matching Edge/Vault pair must use one independently generated,
high-entropy value. Do not reuse a Supabase JWT or another webhook secret.

## Production execution order

### 1. Close profile-role escalation first

Apply only:

`supabase/migrations/20260718030000_guard_profile_authorization_fields.sql`

Do not use a bulk migration command because earlier release migrations remain
sequenced behind the owner minimum-version rollout.

Verify the installed trigger and privileges without exposing data:

```sql
select
  t.tgname,
  n.nspname as function_schema,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where t.tgrelid = 'public.profiles'::regclass
  and not t.tgisinternal
  and t.tgname = 'guard_profile_authorization_fields';

select
  has_function_privilege(
    'anon',
    'private.guard_profile_authorization_fields()',
    'execute'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    'private.guard_profile_authorization_fields()',
    'execute'
  ) as authenticated_can_execute;
```

Both privilege results must be `false`. With a designated non-admin test
account, attempt a normal authenticated profile update and confirm it succeeds.
Then attempt to set `role = 'admin'`; it must fail with SQLSTATE `42501`, and a
separate read must confirm the role did not change.

### 2. Configure the shared database-notification secret

Generate one new value in the approved secret manager. Store that same value
under:

- Edge Functions: `DATABASE_NOTIFICATION_WEBHOOK_SECRET`
- Supabase Vault: `database_notification_webhook_secret`

Confirm names only. Do not query `vault.decrypted_secrets`.

### 3. Deploy the four secured notification functions

Deploy the database-trigger functions with gateway JWT verification disabled;
they perform their own dedicated-secret authentication:

```powershell
npx supabase functions deploy notify-new-favorite `
  --project-ref spspobqzhdvsbeefecby --no-verify-jwt
npx supabase functions deploy notify-new-review `
  --project-ref spspobqzhdvsbeefecby --no-verify-jwt
npx supabase functions deploy notify-new-truck `
  --project-ref spspobqzhdvsbeefecby --no-verify-jwt
```

Deploy the owner/admin announcement function with gateway JWT verification
enabled:

```powershell
npx supabase functions deploy notify-truck-announcement `
  --project-ref spspobqzhdvsbeefecby
```

The three database-trigger notifications are intentionally paused between this
step and the next migration because unauthenticated legacy trigger requests now
receive `401`.

### 4. Replace the three database notification triggers

Immediately apply only:

`supabase/migrations/20260718040000_secure_database_notification_webhooks.sql`

Verify the boundary:

```sql
select
  to_regprocedure('public.notify_new_favorite_webhook()') is null
    as legacy_favorite_removed,
  to_regprocedure('public.notify_new_review_webhook()') is null
    as legacy_review_removed,
  to_regprocedure('public.notify_new_truck_webhook()') is null
    as legacy_truck_removed;

select
  has_function_privilege(
    'anon',
    'private.notify_database_notification_webhook()',
    'execute'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    'private.notify_database_notification_webhook()',
    'execute'
  ) as authenticated_can_execute,
  has_function_privilege(
    'service_role',
    'private.notify_database_notification_webhook()',
    'execute'
  ) as service_role_can_execute;

select
  t.tgname,
  c.relname as table_name,
  n.nspname as function_schema,
  p.proname as function_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where not t.tgisinternal
  and t.tgname in (
    'notify_new_favorite_on_insert',
    'notify_new_review_on_insert',
    'notify_new_truck_on_insert'
  )
order by t.tgname;
```

All three legacy-removal values must be `true`, all three execution privileges
must be `false`, and all three triggers must call
`private.notify_database_notification_webhook`.

Run controlled favorite, review, and new-truck inserts. Confirm the originating
rows commit and exactly the expected notifications are delivered. A direct
request with no secret and one with an incorrect secret must each return `401`.
Do not send the valid secret from a shell or record it in test output.

For announcements, verify:

1. no JWT returns `401`;
2. an authenticated non-owner/non-admin returns `403`;
3. the truck owner succeeds;
4. an admin succeeds; and
5. the push content remains the saved announcement content.

### 5. Complete the existing favorite-open credential remediation

Execute the still-pending sequence in
`docs/favorite-truck-open-webhook-remediation.md`:

1. create the dedicated favorite-open Edge and Vault values;
2. deploy `notify-favorite-truck-open`;
3. immediately apply only
   `20260718010000_secure_favorite_truck_open_webhook.sql`;
4. run the controlled closed-to-open favorite notification;
5. verify truck updates still commit;
6. verify missing/incorrect secrets return `401`;
7. verify the trigger DDL contains no Bearer or JWT literal; and
8. disable the trigger, rather than restoring the old definition, if validation
   fails.

Use the exact DDL and authorization queries already recorded in that runbook.

### 6. Configure and verify GitHub Pages before merging to main

Set the four GitHub values listed above. Confirm names and non-empty status
without printing their contents. A main-branch push triggers a production Pages
deployment, so values must exist before the remediation commits are pushed.

The build must pass `npm run verify-pages-artifact`. After deployment, verify:

1. `/` loads the current application;
2. a direct truck route loads the same release;
3. `/auth/callback` and `/auth/reset-password` load the same release;
4. an unknown route loads the same release shell;
5. authenticated and public Supabase requests use the intended project; and
6. no stale tracked `404.html` bundle exists in the release checkout.

### 7. Continue the owner-gate and Phase 1A sequence

Follow `docs/owner-release-policy.md`: publish both native builds, configure
direct store URLs and minimum builds, prove the owner gate on the current
backend, and only then apply Phase 1A. Hands-Free LIVE remains disabled until
its separate controlled enablement.

### 8. Rotate the service-role credential last

Only after every new notification path and the favorite-open replacement pass:

1. privately inventory every legitimate `SUPABASE_SERVICE_ROLE_KEY` consumer,
   including all Edge Functions, CI, jobs, admin tools, and external services;
2. assign an owner and update procedure to every consumer;
3. rotate the production service-role credential through the supported
   Supabase workflow;
4. update every legitimate consumer through its secret manager;
5. restart or redeploy only consumers that require it;
6. verify each consumer succeeds with the new credential;
7. verify the old credential is rejected without displaying it;
8. inspect relevant Auth, API, database, and Edge logs for suspicious historical
   use; and
9. rerun the complete Phase 1A production read-only preflight.

The dedicated webhook secrets remain independent and are not rotated into a
service-role JWT.

## Failure checkpoints

- Profile guard failure: stop all rollout work and forward-fix the guard.
- Database notification failure: leave the originating database behavior
  available, pause the affected notification triggers, and forward-fix.
- Announcement authorization failure: undeploy or disable that function; do
  not restore unauthenticated invocation.
- Pages verification failure: stop the workflow before artifact upload.
- Favorite-open failure: disable `favorite-truck-open`; never restore its old
  credential-bearing definition.

No rollback may reintroduce client-writable roles, unauthenticated service-role
notification behavior, or a stale web fallback.
