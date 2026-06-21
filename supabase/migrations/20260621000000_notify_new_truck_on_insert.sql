create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_truck_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://spspobqzhdvsbeefecby.supabase.co/functions/v1/notify-new-truck',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', jsonb_build_object(
        'truck_id', new.id,
        'truck_name', new.name,
        'owner_id', new.owner_id,
        'created_at', new.created_at
      )
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notify_new_truck_on_insert on public.trucks;
create trigger notify_new_truck_on_insert
after insert on public.trucks
for each row
execute function public.notify_new_truck_webhook();
