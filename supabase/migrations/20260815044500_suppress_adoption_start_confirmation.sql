-- Reconstructed verbatim from production supabase_migrations.schema_migrations
-- (version 20260815044500). Already applied to production; history-alignment only.

CREATE OR REPLACE FUNCTION private.notify_hands_free_live_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_webhook_secret text;
  v_function_url text;
  v_error_state text;
  v_transition_owner name;
begin
  if new.source <> 'schedule' or new.action not in ('go_live', 'go_offline') then
    return new;
  end if;

  -- An adopted manual early-start is recorded with source='schedule' so the
  -- rest of the Hands-Free pipeline (ownership, auto-off) treats it exactly
  -- like a scheduler-initiated start. But the owner tapped Go Live
  -- themselves, so "Automatically went LIVE" would be misleading. Suppress
  -- only the start confirmation for adopted sessions; the eventual
  -- auto-off confirmation for the same stop is untouched and still fires
  -- normally, since it's accurate regardless of how the session started.
  if new.action = 'go_live'
    and coalesce((new.metadata->>'adoption')::boolean, false) is true
  then
    return new;
  end if;

  select pg_get_userbyid(p.proowner)
  into v_transition_owner
  from pg_catalog.pg_proc p
  where p.pronamespace = to_regnamespace('private')
    and p.proname = 'transition_truck_live'
    and p.pronargs = 12;

  if coalesce(current_setting('trucktap.canonical_live_transition', true), '') <> 'on'
    or v_transition_owner is null
    or current_user <> v_transition_owner
  then
    raise warning
      'Ignoring non-canonical schedule audit event % for confirmation delivery',
      new.id;
    return new;
  end if;

  select s.decrypted_secret
  into v_webhook_secret
  from vault.decrypted_secrets s
  where s.name = 'hands_free_live_webhook_secret'
  limit 1;

  select s.decrypted_secret
  into v_function_url
  from vault.decrypted_secrets s
  where s.name = 'hands_free_live_edge_function_url'
  limit 1;

  if v_webhook_secret is null or length(v_webhook_secret) = 0
    or v_function_url is null or length(v_function_url) = 0
  then
    raise warning
      'Hands-Free LIVE confirmation push is not configured for event %',
      new.id;
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_function_url, '/') || '/notify-hands-free-live-transition',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-TruckTap-Webhook-Secret', v_webhook_secret
    ),
    body := jsonb_build_object('event_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    get stacked diagnostics v_error_state = returned_sqlstate;
    raise warning
      'Hands-Free LIVE confirmation enqueue failed for event % (SQLSTATE %)',
      new.id,
      coalesce(v_error_state, 'unknown');
    return new;
end;
$function$;
