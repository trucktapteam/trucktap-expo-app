-- Two cron jobs both call public.close_stale_open_trucks() on the same */15 * * * *
-- schedule: 'close-stale-open-trucks' (from 20260709000000, guarded on pg_cron
-- availability) and 'close_stale_open_trucks' (from 20260709001000, unconditional).
-- Both are active, running the same cleanup twice every 15 minutes. Keep the
-- unconditionally-scheduled, underscore-named job (matches this project's naming
-- convention elsewhere) and unschedule the hyphenated duplicate. Stale-truck
-- behavior itself (public.close_stale_open_trucks()) is unchanged.

do $$
declare
  has_pg_cron boolean;
begin
  has_pg_cron :=
    to_regnamespace('cron') is not null
    and to_regclass('cron.job') is not null
    and to_regprocedure('cron.unschedule(text)') is not null;

  if has_pg_cron then
    if exists (select 1 from cron.job where jobname = 'close-stale-open-trucks') then
      perform cron.unschedule('close-stale-open-trucks');
    end if;
  end if;
end $$;
