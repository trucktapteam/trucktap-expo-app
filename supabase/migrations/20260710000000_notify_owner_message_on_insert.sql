create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.owner_message_notification_deliveries (
  message_id uuid primary key references public.owner_messages(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  attempted_devices integer,
  failure_count integer,
  error text
);

alter table public.owner_message_notification_deliveries enable row level security;
revoke all on table public.owner_message_notification_deliveries from anon, authenticated;

create or replace function public.notify_owner_message_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_secret text;
begin
  -- Provision out of band with vault.create_secret using the name below, and
  -- store the same value in OWNER_MESSAGE_WEBHOOK_SECRET for the Edge Function.
  select decrypted_secret
    into webhook_secret
    from vault.decrypted_secrets
   where name = 'owner_message_webhook_secret'
   limit 1;

  if webhook_secret is null or webhook_secret = '' then
    raise exception 'Vault secret owner_message_webhook_secret is not configured';
  end if;

  perform net.http_post(
    url := 'https://spspobqzhdvsbeefecby.supabase.co/functions/v1/notify-owner-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-TruckTap-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', jsonb_build_object(
        'id', new.id
      )
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning 'Owner message push enqueue failed for message %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.notify_owner_message_webhook() from public;
revoke all on function public.notify_owner_message_webhook() from anon, authenticated;

drop trigger if exists notify_owner_message_on_insert on public.owner_messages;
create trigger notify_owner_message_on_insert
after insert on public.owner_messages
for each row
execute function public.notify_owner_message_webhook();
