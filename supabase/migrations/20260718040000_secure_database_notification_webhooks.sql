-- Authenticate database-triggered notification Edge Functions with one
-- dedicated Vault-backed secret. Notification enqueue failure never rolls back
-- the originating favorite, review, or truck insert.

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

drop trigger if exists notify_new_favorite_on_insert on public.favorites;
drop trigger if exists notify_new_review_on_insert on public.reviews;
drop trigger if exists notify_new_truck_on_insert on public.trucks;

drop function if exists public.notify_new_favorite_webhook();
drop function if exists public.notify_new_review_webhook();
drop function if exists public.notify_new_truck_webhook();

create or replace function private.notify_database_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_webhook_secret text;
  v_function_name text;
  v_error_state text;
begin
  v_function_name := case
    when tg_table_schema = 'public' and tg_table_name = 'favorites'
      then 'notify-new-favorite'
    when tg_table_schema = 'public' and tg_table_name = 'reviews'
      then 'notify-new-review'
    when tg_table_schema = 'public' and tg_table_name = 'trucks'
      then 'notify-new-truck'
    else null
  end;

  if v_function_name is null then
    raise exception 'Unsupported database notification source %.%',
      tg_table_schema, tg_table_name
      using errcode = '22023';
  end if;

  select s.decrypted_secret
  into v_webhook_secret
  from vault.decrypted_secrets s
  where s.name = 'database_notification_webhook_secret'
  limit 1;

  if v_webhook_secret is null or length(v_webhook_secret) = 0 then
    raise exception 'Vault secret database_notification_webhook_secret is not configured'
      using errcode = '55000';
  end if;

  perform net.http_post(
    url := 'https://spspobqzhdvsbeefecby.supabase.co/functions/v1/'
      || v_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-TruckTap-Webhook-Secret', v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    get stacked diagnostics v_error_state = returned_sqlstate;
    raise warning
      'Database notification enqueue failed for %.% record % (SQLSTATE %)',
      tg_table_schema,
      tg_table_name,
      new.id,
      coalesce(v_error_state, 'unknown');
    return new;
end;
$$;

comment on function private.notify_database_notification_webhook() is
'Queues authenticated favorite, review, and new-truck notification webhooks using Vault entry database_notification_webhook_secret.';

revoke all on function private.notify_database_notification_webhook()
from public, anon, authenticated, service_role;

create trigger notify_new_favorite_on_insert
after insert on public.favorites
for each row execute function private.notify_database_notification_webhook();

create trigger notify_new_review_on_insert
after insert on public.reviews
for each row execute function private.notify_database_notification_webhook();

create trigger notify_new_truck_on_insert
after insert on public.trucks
for each row execute function private.notify_database_notification_webhook();
