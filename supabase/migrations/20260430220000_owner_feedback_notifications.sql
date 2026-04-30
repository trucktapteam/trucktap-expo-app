create extension if not exists pg_net with schema extensions;

alter table public.profiles
  add column if not exists last_favorite_notification_at timestamptz;

create or replace function public.notify_new_favorite_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://spspobqzhdvsbeefecby.supabase.co/functions/v1/notify-new-favorite',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

create or replace function public.notify_new_review_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://spspobqzhdvsbeefecby.supabase.co/functions/v1/notify-new-review',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notify_new_favorite_on_insert on public.favorites;
create trigger notify_new_favorite_on_insert
after insert on public.favorites
for each row
execute function public.notify_new_favorite_webhook();

drop trigger if exists notify_new_review_on_insert on public.reviews;
create trigger notify_new_review_on_insert
after insert on public.reviews
for each row
execute function public.notify_new_review_webhook();
