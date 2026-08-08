-- analytics_events_cleanup_retention() existed only as a standalone helper script
-- (TruckTap-admin/expo/migrations/003_analytics_retention.sql), applied out of band
-- and never scheduled — the 90-day retention it implements was not actually
-- enforced. Recreate it as a tracked migration and schedule it with pg_cron so the
-- retention period is real before any privacy-policy text claims it.

create or replace function public.analytics_events_cleanup_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.analytics_events
  where created_at < now() - interval '90 days';
end;
$$;

comment on function public.analytics_events_cleanup_retention() is
  'Deletes analytics_events rows older than 90 days. Scheduled daily via pg_cron job analytics_events_cleanup_retention.';

revoke all on function public.analytics_events_cleanup_retention() from public, anon, authenticated;

do $$
declare
  has_pg_cron boolean;
  has_existing_job boolean := false;
begin
  has_pg_cron :=
    to_regnamespace('cron') is not null
    and to_regclass('cron.job') is not null
    and to_regprocedure('cron.schedule(text,text,text)') is not null;

  if has_pg_cron then
    execute 'select exists (select 1 from cron.job where jobname = $1)'
      into has_existing_job
      using 'analytics_events_cleanup_retention';

    if not has_existing_job then
      execute 'select cron.schedule($1, $2, $3)'
        using
          'analytics_events_cleanup_retention',
          '0 3 * * *',
          'select public.analytics_events_cleanup_retention();';
    end if;
  else
    raise notice 'pg_cron is not enabled; public.analytics_events_cleanup_retention() was created but not scheduled.';
  end if;
end $$;
