\set ON_ERROR_STOP on

begin;

do $$
declare
  v_has_pg_cron boolean;
  v_job_count int;
begin
  v_has_pg_cron :=
    to_regnamespace('cron') is not null
    and to_regclass('cron.job') is not null;

  if v_has_pg_cron then
    if exists (select 1 from cron.job where jobname = 'close-stale-open-trucks') then
      raise exception 'Duplicate cron job close-stale-open-trucks is still scheduled';
    end if;

    select count(*) into v_job_count
    from cron.job
    where jobname = 'close_stale_open_trucks';

    if v_job_count <> 1 then
      raise exception 'Expected exactly 1 scheduled close_stale_open_trucks cron job, found %', v_job_count;
    end if;
  end if;
end;
$$;

rollback;
