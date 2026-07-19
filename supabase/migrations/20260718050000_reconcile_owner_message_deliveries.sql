-- Make abandoned owner-message delivery claims observable. This does not
-- automatically retry pushes because a worker may have sent to some devices
-- before exiting, and an automatic replay could duplicate those notifications.

create index if not exists owner_message_notification_processing_idx
  on public.owner_message_notification_deliveries (claimed_at)
  where status = 'processing';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.reconcile_owner_message_notification_deliveries(
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reconciled integer;
begin
  if p_now is null then
    raise exception 'Reconciliation timestamp is required'
      using errcode = '22023';
  end if;

  update public.owner_message_notification_deliveries d
  set
    status = 'failed',
    finished_at = p_now,
    failure_count = greatest(coalesce(d.failure_count, 0), 1),
    error = 'Processing timeout after 2 minutes'
  where d.status = 'processing'
    and d.claimed_at < p_now - interval '2 minutes';

  get diagnostics v_reconciled = row_count;
  return v_reconciled;
end;
$$;

revoke all on function private.reconcile_owner_message_notification_deliveries(timestamptz)
from public, anon, authenticated, service_role;

create or replace function public.reconcile_owner_message_notification_deliveries()
returns integer
language sql
security definer
set search_path = pg_catalog
as $$
  select private.reconcile_owner_message_notification_deliveries(
    statement_timestamp()
  );
$$;

revoke all on function public.reconcile_owner_message_notification_deliveries()
from public, anon, authenticated;
grant execute on function public.reconcile_owner_message_notification_deliveries()
to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null
    and not exists (
      select 1
      from cron.job
      where jobname = 'reconcile_owner_message_notification_deliveries'
    )
  then
    perform cron.schedule(
      'reconcile_owner_message_notification_deliveries',
      '* * * * *',
      'select public.reconcile_owner_message_notification_deliveries();'
    );
  end if;
end;
$$;
