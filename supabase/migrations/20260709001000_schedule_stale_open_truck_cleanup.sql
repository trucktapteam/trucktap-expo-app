do $$
declare
  has_existing_job boolean := false;
begin
  select exists (
    select 1
    from cron.job
    where jobname = 'close_stale_open_trucks'
  ) into has_existing_job;

  if not has_existing_job then
    perform cron.schedule(
      'close_stale_open_trucks',
      '*/15 * * * *',
      'SELECT public.close_stale_open_trucks();'
    );
  end if;
end $$;
