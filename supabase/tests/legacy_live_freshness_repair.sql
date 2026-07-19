\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

do $$
declare
  v_owner constant uuid := 'a7000000-0000-4000-8000-000000000001';
  v_legacy_stale constant uuid := 'b7000000-0000-4000-8000-000000000001';
  v_legacy_fresh constant uuid := 'b7000000-0000-4000-8000-000000000002';
  v_valid_live constant uuid := 'b7000000-0000-4000-8000-000000000003';
  v_closed constant uuid := 'b7000000-0000-4000-8000-000000000004';
  v_valid_started timestamptz := statement_timestamp() - interval '1 hour';
  v_valid_expires timestamptz := statement_timestamp() + interval '11 hours';
begin
  insert into auth.users (id, email)
  values (v_owner, 'legacy-live-repair-owner@example.test');

  update public.profiles
  set role = 'truck',
      display_name = 'Legacy LIVE Repair Owner'
  where id = v_owner;

  insert into public.trucks (
    id, owner_id, name, is_open, updated_at,
    last_live_updated_at, live_started_at, live_expires_at, live_source
  ) values
    (
      v_legacy_stale, v_owner, 'Legacy Stale', true,
      statement_timestamp() - interval '2 days',
      null, null, null, null
    ),
    (
      v_legacy_fresh, v_owner, 'Legacy Fresh', true,
      statement_timestamp() - interval '1 hour',
      null, null, null, null
    ),
    (
      v_valid_live, v_owner, 'Valid LIVE', true,
      statement_timestamp(),
      v_valid_started, v_valid_started, v_valid_expires, 'manual'
    ),
    (
      v_closed, v_owner, 'Closed', false,
      statement_timestamp() - interval '3 days',
      null, null, null, null
    );
end;
$$;

create temporary table valid_live_before on commit drop as
select
  is_open,
  last_live_updated_at,
  live_started_at,
  live_expires_at,
  live_source,
  live_stop_id
from public.trucks
where id = 'b7000000-0000-4000-8000-000000000003'::uuid;

create temporary table closed_before on commit drop as
select
  is_open,
  last_live_updated_at,
  live_started_at,
  live_expires_at,
  live_source,
  live_stop_id
from public.trucks
where id = 'b7000000-0000-4000-8000-000000000004'::uuid;

-- Exercise the actual migration repair after the fixtures exist.
\ir ../migrations/20260718070000_repair_legacy_live_freshness.sql

do $$
declare
  v_legacy_stale constant uuid := 'b7000000-0000-4000-8000-000000000001';
  v_legacy_fresh constant uuid := 'b7000000-0000-4000-8000-000000000002';
  v_valid_live constant uuid := 'b7000000-0000-4000-8000-000000000003';
  v_closed constant uuid := 'b7000000-0000-4000-8000-000000000004';
  v_event_count integer;
begin
  perform pg_temp.assert_true(
    (select is_open is false from public.trucks where id = v_legacy_stale),
    'an already-stale legacy open row must close'
  );

  perform pg_temp.assert_true(
    (
      select is_open is true
        and live_source = 'legacy_backfill'
        and last_live_updated_at is not null
        and live_expires_at > statement_timestamp()
        and live_expires_at <= statement_timestamp() + interval '12 hours'
      from public.trucks
      where id = v_legacy_fresh
    ),
    'a fresh legacy row must receive bounded lifecycle state'
  );

  perform pg_temp.assert_true(
    (
      select row(
        t.is_open,
        t.last_live_updated_at,
        t.live_started_at,
        t.live_expires_at,
        t.live_source,
        t.live_stop_id
      ) is not distinct from row(
        b.is_open,
        b.last_live_updated_at,
        b.live_started_at,
        b.live_expires_at,
        b.live_source,
        b.live_stop_id
      )
      from public.trucks t
      cross join valid_live_before b
      where t.id = v_valid_live
    ),
    'a valid LIVE session must remain unchanged'
  );

  perform pg_temp.assert_true(
    (
      select row(
        t.is_open,
        t.last_live_updated_at,
        t.live_started_at,
        t.live_expires_at,
        t.live_source,
        t.live_stop_id
      ) is not distinct from row(
        b.is_open,
        b.last_live_updated_at,
        b.live_started_at,
        b.live_expires_at,
        b.live_source,
        b.live_stop_id
      )
      from public.trucks t
      cross join closed_before b
      where t.id = v_closed
    ),
    'a closed row must remain unchanged'
  );

  select count(*)
  into v_event_count
  from public.truck_live_events
  where truck_id = v_legacy_stale
    and action = 'go_offline'
    and source = 'expiration'
    and metadata ->> 'closed_by' = 'close_stale_open_trucks';

  perform pg_temp.assert_true(
    v_event_count = 1,
    'the stale legacy close must use the canonical expiration audit path'
  );
end;
$$;

-- Reapplying the migration must not change repaired state or duplicate audits.
\ir ../migrations/20260718070000_repair_legacy_live_freshness.sql

do $$
declare
  v_owner constant uuid := 'a7000000-0000-4000-8000-000000000001';
  v_legacy_stale constant uuid := 'b7000000-0000-4000-8000-000000000001';
  v_future_malformed constant uuid := 'b7000000-0000-4000-8000-000000000005';
  v_event_count integer;
  v_closed_count integer;
begin
  select count(*)
  into v_event_count
  from public.truck_live_events
  where truck_id = v_legacy_stale
    and action = 'go_offline'
    and source = 'expiration';

  perform pg_temp.assert_true(
    v_event_count = 1,
    'repeated repair execution must be idempotent'
  );

  -- Simulate a future corrupt insert. The permanent cleanup predicate must
  -- close it even though both fallback timestamps are null.
  insert into public.trucks (
    id, owner_id, name, is_open, updated_at,
    last_live_updated_at, live_started_at, live_expires_at, live_source
  ) values (
    v_future_malformed, v_owner, 'Future Malformed', true,
    statement_timestamp(), null, null, null, null
  );

  select public.close_stale_open_trucks()
  into v_closed_count;

  perform pg_temp.assert_true(
    v_closed_count = 1,
    'cleanup must count a future null/null malformed open row'
  );

  perform pg_temp.assert_true(
    (select is_open is false from public.trucks where id = v_future_malformed),
    'cleanup must close a future null/null malformed open row'
  );

  perform pg_temp.assert_true(
    (
      select count(*) = 1
      from public.truck_live_events
      where truck_id = v_future_malformed
        and action = 'go_offline'
        and source = 'expiration'
        and metadata ->> 'closed_by' = 'close_stale_open_trucks'
    ),
    'future malformed cleanup must use the canonical audit path'
  );
end;
$$;

rollback;

\echo 'legacy LIVE freshness repair tests passed'
