# Favorite Truck Open Webhook Credential Remediation

The exact remaining cross-system production order is consolidated in
`docs/critical-release-remediation-runbook.md`. This runbook remains the
authoritative detailed procedure for the favorite-open portion of that order.

## Required secret names

- Edge Function environment: `FAVORITE_TRUCK_OPEN_WEBHOOK_SECRET`
- Database Vault secret: `favorite_truck_open_webhook_secret`

The Edge Function environment value and database Vault secret must contain the
same high-entropy random value. Never put that value directly in migration SQL,
trigger arguments, comments, logs, test fixtures, or source control. The helper
pins the non-secret destination URL to the production
`notify-favorite-truck-open` Edge Function so a Vault misconfiguration cannot
redirect the secret to an arbitrary host.

## Approved rollout strategy

Use a brief controlled notification pause. Truck updates must remain available
throughout. The expected pause starts when the updated Edge Function is
deployed and ends when the migration and controlled notification test pass.
The operational target is under five minutes, with a ten-minute stop threshold.
Notifications attempted during the pause are not replayed automatically.

All commands below must be run from the reviewed `expo` release checkout.
Replace `<schema-dump-path>` with a secure local path. Secret values must be
copied from the approved secret manager and must never appear in a command,
terminal transcript, SQL file, source file, or shell history.

### Preflight: no production writes

1. Confirm the checkout and exact remediation diff:

   ```powershell
   git status --short
   git diff --check
   git diff -- supabase/config.toml `
     supabase/functions/notify-favorite-truck-open/index.ts `
     supabase/functions/notify-favorite-truck-open/index.test.ts `
     supabase/migrations/20260718010000_secure_favorite_truck_open_webhook.sql `
     docs/favorite-truck-open-webhook-remediation.md
   ```

2. Confirm the authenticated CLI target is exactly production project
   `spspobqzhdvsbeefecby`:

   ```powershell
   npx supabase projects list
   ```

   Stop if the intended project cannot be identified unambiguously. Do not run
   `supabase db push` or `supabase migration up`: the checkout also contains a
   pending Phase 1A migration that is outside this rollout.

3. Generate a 32-byte or stronger random secret directly in the approved secret
   manager. Name the managed entry `favorite-truck-open webhook production`.
   Do not reuse any Supabase JWT.

### Production sequence

1. In Supabase Dashboard for project `spspobqzhdvsbeefecby`, open **Edge
   Functions > Secrets** and create:

   ```text
   FAVORITE_TRUCK_OPEN_WEBHOOK_SECRET
   ```

   Paste the value directly from the secret manager. Confirm only the name:

   ```powershell
   npx supabase secrets list --project-ref spspobqzhdvsbeefecby
   ```

2. In the same project's **Database > Vault**, create exactly one secret named:

   ```text
   favorite_truck_open_webhook_secret
   ```

   Paste the same value directly from the secret manager. If that name already
   exists, update the existing entry rather than creating a duplicate. Never
   select or print `vault.decrypted_secrets` during deployment verification.

3. Start the notification-pause timer and deploy the reviewed function:

   ```powershell
   npx supabase functions deploy notify-favorite-truck-open `
     --project-ref spspobqzhdvsbeefecby `
     --no-verify-jwt
   ```

4. Immediately apply only
   `20260718010000_secure_favorite_truck_open_webhook.sql`. Copy the reviewed
   file without modification:

   ```powershell
   Get-Content -Raw `
     supabase/migrations/20260718010000_secure_favorite_truck_open_webhook.sql `
     | Set-Clipboard
   ```

   In the production SQL Editor, paste it into a new query, verify the project
   reference is `spspobqzhdvsbeefecby`, and run it once. This deliberately
   avoids a bulk migration command that could also apply
   `20260718000000_hands_free_live_phase_1a.sql`. The migration is idempotent
   enough to be reapplied later by the normal migration ledger workflow.

5. Perform one controlled closed-to-open update through the normal owner
   workflow for a designated test truck favorited by a designated test account.
   Record the truck ID, test-account ID, update timestamp, Edge invocation ID,
   and Expo ticket outcome, but no tokens or secrets.

6. End the notification pause only after all of these pass:

   - the truck update committed and ordinary follow-up truck updates work;
   - the Edge invocation returned success using the database-supplied dedicated
     secret;
   - the designated device received exactly the expected notification;
   - missing and deliberately incorrect secrets return HTTP 401;
   - the trigger calls
     `private.notify_favorite_truck_open_webhook()` and its DDL contains no
     `Bearer` header or JWT-shaped literal;
   - `anon`, `authenticated`, and `service_role` have no execute privilege on
     the helper;
   - `anon` and `authenticated` have no access to the `vault` schema or
     `net` internals.

   Missing-secret check:

   ```powershell
   Invoke-WebRequest -Method Post `
     -Uri "https://spspobqzhdvsbeefecby.supabase.co/functions/v1/notify-favorite-truck-open" `
     -ContentType "application/json" `
     -Body '{"record":{},"old_record":{}}' `
     -SkipHttpErrorCheck
   ```

   Incorrect-secret check:

   ```powershell
   Invoke-WebRequest -Method Post `
     -Uri "https://spspobqzhdvsbeefecby.supabase.co/functions/v1/notify-favorite-truck-open" `
     -Headers @{"X-TruckTap-Webhook-Secret"="intentionally-invalid"} `
     -ContentType "application/json" `
     -Body '{"record":{},"old_record":{}}' `
     -SkipHttpErrorCheck
   ```

   Both responses must be HTTP 401 with a generic body and no secret material.

7. Run the following read-only authorization/DDL checks in production SQL
   Editor:

   ```sql
   select
     pg_get_triggerdef(t.oid) as trigger_definition,
     p.oid::regprocedure as helper,
     p.prosecdef as security_definer,
     p.proconfig as function_settings,
     has_function_privilege(
       'anon',
       'private.notify_favorite_truck_open_webhook()',
       'execute'
     ) as anon_can_execute,
     has_function_privilege(
       'authenticated',
       'private.notify_favorite_truck_open_webhook()',
       'execute'
     ) as authenticated_can_execute,
     has_function_privilege(
       'service_role',
       'private.notify_favorite_truck_open_webhook()',
       'execute'
     ) as service_role_can_execute
   from pg_trigger t
   join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.trucks'::regclass
     and t.tgname = 'favorite-truck-open'
     and not t.tgisinternal;

   select
     has_schema_privilege('anon', 'vault', 'usage') as anon_vault_usage,
     has_schema_privilege('authenticated', 'vault', 'usage')
       as authenticated_vault_usage,
     has_schema_privilege('anon', 'net', 'usage') as anon_net_usage,
     has_schema_privilege('authenticated', 'net', 'usage')
       as authenticated_net_usage;

   select grantee, table_schema, table_name, privilege_type
   from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated')
     and table_schema in ('vault', 'net')
   order by grantee, table_schema, table_name, privilege_type;
   ```

   Expected results: `security_definer = true`,
   `function_settings = {"search_path=pg_catalog"}`, and every privilege result
   is `false`. The table-grant query must return no rows.

8. Create a credential scan without printing matches to the terminal:

   ```powershell
   npx supabase db dump --linked `
     --schema public,private,supabase_functions `
     --file <schema-dump-path>
   $dump = Get-Content -Raw <schema-dump-path>
   [pscustomobject]@{
     bearer_literal_count = ([regex]::Matches(
       $dump,
       '(?i)authorization[^\r\n]{0,80}bearer'
     )).Count
     jwt_shaped_literal_count = ([regex]::Matches(
       $dump,
       'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
     )).Count
   }
   ```

   Both counts must be zero. Securely delete the local dump after the reviewed
   result is recorded.

### Failure action

At any failed validation after the Edge deployment, pause notifications by
disabling or dropping `favorite-truck-open`. Do not restore the former
credential-bearing definition:

```sql
alter table public.trucks disable trigger "favorite-truck-open";
```

Truck updates remain available. Diagnose the new path, implement a reviewed
forward migration, re-enable or recreate the secure trigger, and repeat the
controlled test. The ten-minute threshold is a decision point to disable the
trigger, not permission to restore the old implementation.

### Service-role rotation after the new path is proven

1. Privately inventory every legitimate non-database consumer of
   `SUPABASE_SERVICE_ROLE_KEY`, including Edge Function environments, CI/CD,
   server jobs, administrative tools, and external integrations. Record owner,
   location, purpose, and update/verification procedure without recording the
   credential.
2. Confirm every consumer has an owner and a ready update path.
3. Rotate the production service-role credential using the Supabase-supported
   production rotation workflow.
4. Update every legitimate consumer through its secret manager. Include the
   Edge Function environment where applicable. The favorite-truck-open webhook
   secret is independent and must not be changed to a service-role credential.
5. Restart or redeploy consumers only as required to load the new value.
6. Verify each consumer succeeds with the new credential.
7. Verify the old credential is rejected without printing it.
8. Review API, Auth, database, and Edge Function logs for suspicious historical
   use, preserving relevant timestamps and request identifiers without secret
   material.
9. Re-run the complete Phase 1A production read-only preflight before seeking
   separate approval to deploy Phase 1A.

## Rollback

The safe rollback is operational, not a return to the embedded JWT:

1. Keep the dedicated Edge Function secret configured.
2. Disable or drop `favorite-truck-open` if it is causing unexpected behavior.
   Truck updates remain functional; only favorite-open notifications pause.
3. Diagnose Vault lookup, URL, `pg_net`, and Edge Function errors without
   logging secret values.
4. Correct the helper in a new forward migration and recreate the trigger.
5. Re-run the controlled notification test and credential-free schema scan.

Never restore the former trigger definition containing a service-role JWT.
