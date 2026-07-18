-- Replace the production dashboard-created webhook trigger that embedded a
-- service-role JWT with a Vault-backed, least-privilege shared secret.

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.notify_favorite_truck_open_webhook()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_webhook_secret text;
  v_error_state text;
begin
  select s.decrypted_secret
  into v_webhook_secret
  from vault.decrypted_secrets s
  where s.name = 'favorite_truck_open_webhook_secret'
  limit 1;

  if v_webhook_secret is null or length(v_webhook_secret) = 0 then
    raise exception 'Favorite truck open webhook secret is not configured'
      using errcode = '55000';
  end if;

  perform net.http_post(
    url := 'https://spspobqzhdvsbeefecby.supabase.co/functions/v1/notify-favorite-truck-open',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-TruckTap-Webhook-Secret', v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    get stacked diagnostics v_error_state = returned_sqlstate;
    raise warning
      'Favorite truck open webhook enqueue failed for truck % (SQLSTATE %)',
      new.id,
      coalesce(v_error_state, 'unknown');
    return new;
end;
$$;

comment on function private.notify_favorite_truck_open_webhook() is
'Queues the favorite-truck-open Edge Function webhook using Vault entry favorite_truck_open_webhook_secret. Never blocks the truck update when notification enqueueing fails.';

revoke all on function private.notify_favorite_truck_open_webhook()
from public, anon, authenticated, service_role;

drop trigger if exists "favorite-truck-open" on public.trucks;

create trigger "favorite-truck-open"
after update on public.trucks
for each row
execute function private.notify_favorite_truck_open_webhook();
