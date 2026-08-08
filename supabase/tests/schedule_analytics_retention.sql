\set ON_ERROR_STOP on

begin;

do $$
declare
  v_old_event bigint := 900001;
  v_recent_event bigint := 900002;
  v_has_pg_cron boolean;
  v_job_count int;
begin
  if has_function_privilege('anon', 'public.analytics_events_cleanup_retention()', 'execute')
    or has_function_privilege('authenticated', 'public.analytics_events_cleanup_retention()', 'execute')
  then
    raise exception 'analytics_events_cleanup_retention() must not be callable by anon/authenticated';
  end if;

  insert into public.analytics_events (id, event_type, event_source, created_at)
  values (v_old_event, 'retention-test-old', 'database-test', now() - interval '91 days');

  insert into public.analytics_events (id, event_type, event_source, created_at)
  values (v_recent_event, 'retention-test-recent', 'database-test', now() - interval '10 days');

  perform public.analytics_events_cleanup_retention();

  if exists (select 1 from public.analytics_events where id = v_old_event) then
    raise exception 'analytics_events_cleanup_retention() left a row older than 90 days in place';
  end if;

  if not exists (select 1 from public.analytics_events where id = v_recent_event) then
    raise exception 'analytics_events_cleanup_retention() deleted a row inside the 90-day window';
  end if;

  v_has_pg_cron :=
    to_regnamespace('cron') is not null
    and to_regclass('cron.job') is not null;

  if v_has_pg_cron then
    select count(*) into v_job_count
    from cron.job
    where jobname = 'analytics_events_cleanup_retention';

    if v_job_count <> 1 then
      raise exception 'Expected exactly 1 scheduled analytics_events_cleanup_retention cron job, found %', v_job_count;
    end if;
  end if;
end;
$$;

rollback;
