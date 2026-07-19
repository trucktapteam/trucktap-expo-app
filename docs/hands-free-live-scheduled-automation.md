# Hands-Free LIVE scheduled automation

## Safety model

The scheduler never updates LIVE state or canonical locations directly. Every
automatic start and end delegates to `private.transition_truck_live` with
`source = 'schedule'`.

`trucks.live_stop_id` owns an automatic session. An automatic end supplies
both the expected stop ID and expected `live_started_at`, so an old stop cannot
close a manual restart or a newer scheduled session.

Manual owner Go LIVE and Stop Serving remain authoritative. Manual Go LIVE
clears scheduled ownership. A scheduled start that finds a manual session
makes no state change and rechecks only during the stop's existing start grace
window. If the owner stops the manual session during grace, the scheduled start
may proceed. Otherwise it resolves as `blocked_manual_live` when grace expires.

## Processor

`public.process_hands_free_live_schedule()` is executable only by
`service_role`. `pg_cron` invokes it every minute. The migration creates the
job but installs the private global configuration with `enabled = false`.

Each pass:

1. Takes a transaction advisory lock.
2. Processes due ends before starts.
3. Locks candidates with `FOR UPDATE SKIP LOCKED`.
4. Processes a bounded batch in deterministic timestamp/ID order.
5. Isolates exceptions per candidate.
6. Returns structured changed, no-op, retry, missed, and failure counts.

Failures are written to `private.hands_free_live_processor_attempts` with the
truck/stop IDs, SQLSTATE, and a bounded sanitized message. They do not create a
normal LIVE event and do not block later candidates.

## Timing configuration

The singleton row in `private.hands_free_live_settings` controls:

- the global kill switch;
- start grace;
- end grace;
- the short previous-stop retry window;
- maximum start retries; and
- batch size.

Initial defaults are 15 minutes, 5 minutes, 2 minutes, three retries, and 100
candidates. Only trusted database operators can access this table.

A missed start runs only while it is both inside start grace and before the
stop ends. Late ends are still attempted through compare-and-set. If a whole
stop was missed, it is resolved without briefly making the truck LIVE.

## Owner controls and status

Owners cannot read or write internal automation columns. They use:

- `get_hands_free_live_owner_settings`
- `get_upcoming_stop_automation_statuses`
- `configure_upcoming_stop_live_automation`
- `set_hands_free_live_confirmation_notifications`

The app geocodes the stop address when the owner opts in and sends finite
coordinates plus the device IANA timezone to the configuration RPC. Database
validation remains authoritative.

Owner-facing outcomes include Ready, Automatically went LIVE, Automatically
stopped serving, Blocked because already LIVE manually, Blocked by another
scheduled stop, and Start window was missed.

## Reminders

Local Upcoming Stop reminders remain independent from automation. The existing
AsyncStorage keys and notification payload remain compatible. Owners can select
a 15-, 30-, or 60-minute reminder. Changing a reminder does not arm or disarm
Hands-Free LIVE.

## Optional confirmation pushes

Successful `source = 'schedule'` audit events enqueue a best-effort call to
`notify-hands-free-live-transition`. Notification failure never rolls back or
changes the transition.

Required production configuration:

- Edge Function secret: `HANDS_FREE_LIVE_WEBHOOK_SECRET`
- Vault secret: `hands_free_live_webhook_secret`
- Vault value containing the Edge Functions base URL:
  `hands_free_live_edge_function_url`

The database sends only the event ID. The Edge Function reloads the committed
event, verifies that it is a scheduled transition, reloads the truck owner and
preference, and uses an attempt-aware delivery claim. The existing minute
processor marks claims still processing after two minutes as failed with a
visible timeout reason. Replaying the event may reclaim a failed delivery, and
the attempt counter prevents a late older attempt from overwriting its retry.
Secrets are never included in SQL trigger DDL, payloads, logs, or errors.

## Safe enablement

1. Apply the migration while the global setting remains disabled.
2. Deploy the confirmation Edge Function.
3. Store matching dedicated webhook secrets and the function base URL.
4. Run local/staging ownership, overlap, missed-run, and permission tests.
5. Set `private.hands_free_live_settings.enabled = true` in a controlled
   production change.
6. Arm one controlled future stop and observe its owner-visible status, audit
   event, transition, end, and optional pushes.

To pause new automatic starts immediately, set the global flag to false.
Already-owned scheduled sessions continue through the CAS-protected end path so
the pause cannot strand a truck LIVE. Existing manual LIVE/OFFLINE controls
continue to work. Do not remove or bypass the canonical transition guards.
