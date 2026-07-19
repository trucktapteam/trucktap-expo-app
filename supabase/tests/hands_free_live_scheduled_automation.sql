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
  v_owner_a constant uuid := 'a1000000-0000-4000-8000-000000000001';
  v_owner_b constant uuid := 'a1000000-0000-4000-8000-000000000002';
  v_truck_a constant uuid := 'b1000000-0000-4000-8000-000000000001';
  v_truck_b constant uuid := 'b1000000-0000-4000-8000-000000000002';
  v_truck_c constant uuid := 'b1000000-0000-4000-8000-000000000003';
  v_truck_d constant uuid := 'b1000000-0000-4000-8000-000000000004';
  v_truck_e constant uuid := 'b1000000-0000-4000-8000-000000000005';
  v_truck_f constant uuid := 'b1000000-0000-4000-8000-000000000006';
  v_truck_g constant uuid := 'b1000000-0000-4000-8000-000000000007';
  v_truck_h constant uuid := 'b1000000-0000-4000-8000-000000000008';
  v_truck_i constant uuid := 'b1000000-0000-4000-8000-000000000009';
  v_stop_a constant uuid := 'c1000000-0000-4000-8000-000000000001';
  v_stop_b constant uuid := 'c1000000-0000-4000-8000-000000000002';
  v_stop_c constant uuid := 'c1000000-0000-4000-8000-000000000003';
  v_stop_d constant uuid := 'c1000000-0000-4000-8000-000000000004';
  v_stop_e1 constant uuid := 'c1000000-0000-4000-8000-000000000005';
  v_stop_e2 constant uuid := 'c1000000-0000-4000-8000-000000000006';
  v_stop_f1 constant uuid := 'c1000000-0000-4000-8000-000000000007';
  v_stop_f2 constant uuid := 'c1000000-0000-4000-8000-000000000008';
  v_stop_g constant uuid := 'c1000000-0000-4000-8000-000000000009';
  v_stop_h constant uuid := 'c1000000-0000-4000-8000-000000000010';
  v_stop_i constant uuid := 'c1000000-0000-4000-8000-000000000011';
  v_base timestamptz := statement_timestamp() + interval '1 hour';
  v_result jsonb;
  v_count integer;
  v_label text;
  v_event_id uuid;
  v_claimed boolean;
  v_attempt_count integer;
  v_rows integer;
begin
  insert into auth.users (id, email)
  values
    (v_owner_a, 'hands-free-owner-a@example.test'),
    (v_owner_b, 'hands-free-owner-b@example.test');

  update public.profiles p
  set role = fixture.role,
      display_name = fixture.display_name
  from (
    values
      (v_owner_a, 'truck', 'Automation Owner A'),
      (v_owner_b, 'truck', 'Automation Owner B')
  ) as fixture(id, role, display_name)
  where p.id = fixture.id;

  insert into public.trucks (id, owner_id, name)
  values
    (v_truck_a, v_owner_a, 'Isolation A'),
    (v_truck_b, v_owner_a, 'Isolation B'),
    (v_truck_c, v_owner_a, 'Isolation C'),
    (v_truck_d, v_owner_a, 'Manual Wins'),
    (v_truck_e, v_owner_a, 'Back to Back'),
    (v_truck_f, v_owner_a, 'Overlap'),
    (v_truck_g, v_owner_a, 'Missed Start'),
    (v_truck_h, v_owner_a, 'Owner RPC'),
    (v_truck_i, v_owner_a, 'Manual Grace Boundary');

  update private.hands_free_live_settings
  set enabled = true,
      start_grace = interval '15 minutes',
      end_grace = interval '5 minutes',
      start_retry_window = interval '2 minutes',
      max_start_retries = 3,
      batch_size = 100
  where singleton is true;

  -- A and C are valid. B bypasses validation only to simulate corrupt legacy
  -- state and prove candidate-level exception isolation.
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status,
    latitude, longitude, timezone, auto_manage_live
  ) values
    (
      v_stop_a, v_truck_a, v_base + interval '10 minutes',
      v_base + interval '60 minutes', 'Valid A', 'scheduled',
      40.1, -75.1, 'America/New_York', true
    ),
    (
      v_stop_c, v_truck_c, v_base + interval '12 minutes',
      v_base + interval '60 minutes', 'Valid C', 'scheduled',
      40.3, -75.3, 'America/New_York', true
    );

  set local session_replication_role = replica;
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status,
    latitude, longitude, timezone, auto_manage_live
  ) values (
    v_stop_b, v_truck_b, v_base + interval '11 minutes',
    v_base + interval '60 minutes', 'Malformed B', 'scheduled',
    null, -75.2, 'America/New_York', true
  );
  set local session_replication_role = origin;

  select private.process_hands_free_live_schedule(v_base + interval '13 minutes')
  into v_result;

  perform pg_temp.assert_true(
    (v_result ->> 'starts_changed')::integer = 2,
    'A and C should start'
  );
  perform pg_temp.assert_true(
    (v_result ->> 'failures')::integer = 1,
    'malformed B should be isolated as one failure'
  );
  perform pg_temp.assert_true(
    (select is_open and live_stop_id = v_stop_a from public.trucks where id = v_truck_a),
    'A should remain LIVE after B fails'
  );
  perform pg_temp.assert_true(
    (select is_open is false from public.trucks where id = v_truck_b),
    'B should remain unchanged'
  );
  perform pg_temp.assert_true(
    (select auto_start_resolved_at is null from public.upcoming_stops where id = v_stop_b),
    'B should remain unresolved for a later retry'
  );
  perform pg_temp.assert_true(
    (select is_open and live_stop_id = v_stop_c from public.trucks where id = v_truck_c),
    'C should still start after B fails'
  );

  select count(*)
  into v_count
  from public.truck_live_events
  where stop_id in (v_stop_a, v_stop_b, v_stop_c)
    and action = 'go_live'
    and source = 'schedule';
  perform pg_temp.assert_true(v_count = 2, 'only A and C should have schedule start audits');

  select private.process_hands_free_live_schedule(v_base + interval '13 minutes')
  into v_result;
  select count(*)
  into v_count
  from public.truck_live_events
  where stop_id in (v_stop_a, v_stop_b, v_stop_c)
    and action = 'go_live'
    and source = 'schedule';
  perform pg_temp.assert_true(v_count = 2, 'repeated processor run must not duplicate starts');

  -- Manual LIVE is never replaced. It is rechecked only inside start grace.
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status,
    latitude, longitude, timezone, auto_manage_live
  ) values (
    v_stop_d, v_truck_d, v_base + interval '20 minutes',
    v_base + interval '70 minutes', 'Manual Wins Stop', 'scheduled',
    40.4, -75.4, 'America/New_York', true
  );

  perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
  perform public.go_live_truck(
    v_truck_d, 'schedule', 40.41, -75.41, 'Manual Location',
    '{"test":"manual_wins"}'::jsonb
  );

  perform private.process_hands_free_live_schedule(v_base + interval '21 minutes');
  perform pg_temp.assert_true(
    (select is_open and live_stop_id is null and live_source = 'manual'
     from public.trucks where id = v_truck_d),
    'manual LIVE should remain authoritative'
  );
  perform pg_temp.assert_true(
    (select auto_start_resolved_at is null
       and auto_start_outcome = 'retrying_manual_live'
       and auto_start_retry_count = 1
     from public.upcoming_stops where id = v_stop_d),
    'manual collision should remain eligible during start grace'
  );

  select status_label
  into v_label
  from public.get_upcoming_stop_automation_statuses(v_truck_d)
  where stop_id = v_stop_d;
  perform pg_temp.assert_true(
    v_label = 'Waiting for manual LIVE session',
    'owner should see the bounded manual retry outcome'
  );

  perform public.go_offline_truck(
    v_truck_d,
    'manual',
    '{"test":"manual_collision_cleared"}'::jsonb
  );
  perform private.process_hands_free_live_schedule(v_base + interval '22 minutes');
  perform pg_temp.assert_true(
    (select is_open and live_stop_id = v_stop_d and live_source = 'schedule'
     from public.trucks where id = v_truck_d),
    'scheduled start should succeed if manual LIVE clears during grace'
  );

  -- A manual session that remains through the grace boundary is resolved
  -- without ever being replaced.
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status,
    latitude, longitude, timezone, auto_manage_live
  ) values (
    v_stop_i, v_truck_i, v_base + interval '20 minutes',
    v_base + interval '70 minutes', 'Manual Grace Stop', 'scheduled',
    40.45, -75.45, 'America/New_York', true
  );
  perform public.go_live_truck(
    v_truck_i, 'manual', 40.46, -75.46, 'Persistent Manual Location',
    '{"test":"manual_grace_boundary"}'::jsonb
  );
  perform private.process_hands_free_live_schedule(v_base + interval '21 minutes');
  perform private.process_hands_free_live_schedule(v_base + interval '36 minutes');
  perform pg_temp.assert_true(
    (select is_open and live_stop_id is null and live_source = 'manual'
     from public.trucks where id = v_truck_i),
    'persistent manual LIVE should remain untouched after grace'
  );
  perform pg_temp.assert_true(
    (select auto_start_resolved_at is not null
       and auto_start_outcome = 'blocked_manual_live'
     from public.upcoming_stops where id = v_stop_i),
    'persistent manual collision should resolve at the grace boundary'
  );

  -- A stale scheduled end cannot close a newer manual session.
  perform public.go_offline_truck(v_truck_a, 'schedule', '{"test":"manual_stop"}'::jsonb);
  perform public.go_live_truck(
    v_truck_a, 'schedule', 41.1, -76.1, 'New Manual Session',
    '{"test":"manual_restart"}'::jsonb
  );
  perform private.process_hands_free_live_schedule(v_base + interval '66 minutes');
  perform pg_temp.assert_true(
    (select is_open and live_stop_id is null and live_source = 'manual'
     from public.trucks where id = v_truck_a),
    'old scheduled end must not close a newer manual session'
  );
  perform pg_temp.assert_true(
    (select auto_end_outcome = 'live_stop_mismatch'
     from public.upcoming_stops where id = v_stop_a),
    'stale end should resolve as an ownership mismatch'
  );

  -- Back-to-back stops end the old owner before starting the next.
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status,
    latitude, longitude, timezone, auto_manage_live
  ) values
    (
      v_stop_e1, v_truck_e, v_base + interval '20 minutes',
      v_base + interval '40 minutes', 'Back to Back One', 'scheduled',
      40.5, -75.5, 'America/New_York', true
    ),
    (
      v_stop_e2, v_truck_e, v_base + interval '40 minutes',
      v_base + interval '70 minutes', 'Back to Back Two', 'scheduled',
      40.6, -75.6, 'America/New_York', true
    );

  perform private.process_hands_free_live_schedule(v_base + interval '21 minutes');
  perform private.process_hands_free_live_schedule(v_base + interval '46 minutes');
  perform pg_temp.assert_true(
    (select is_open and live_stop_id = v_stop_e2
     from public.trucks where id = v_truck_e),
    'second back-to-back stop should own LIVE'
  );
  perform pg_temp.assert_true(
    (select auto_end_outcome = 'went_offline'
     from public.upcoming_stops where id = v_stop_e1),
    'first back-to-back stop should close first'
  );

  -- A true overlap never replaces the first scheduled owner.
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status,
    latitude, longitude, timezone, auto_manage_live
  ) values
    (
      v_stop_f1, v_truck_f, v_base + interval '20 minutes',
      v_base + interval '90 minutes', 'Overlap One', 'scheduled',
      40.7, -75.7, 'America/New_York', true
    ),
    (
      v_stop_f2, v_truck_f, v_base + interval '30 minutes',
      v_base + interval '100 minutes', 'Overlap Two', 'scheduled',
      40.8, -75.8, 'America/New_York', true
    );

  perform private.process_hands_free_live_schedule(v_base + interval '21 minutes');
  perform private.process_hands_free_live_schedule(v_base + interval '31 minutes');
  perform pg_temp.assert_true(
    (select live_stop_id = v_stop_f1 from public.trucks where id = v_truck_f),
    'first overlapping stop should keep ownership'
  );
  perform pg_temp.assert_true(
    (select auto_start_outcome = 'blocked_overlap'
     from public.upcoming_stops where id = v_stop_f2),
    'later overlap should resolve without replacement'
  );

  -- Missed scheduler runs do not briefly start expired grace windows.
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status,
    latitude, longitude, timezone, auto_manage_live
  ) values (
    v_stop_g, v_truck_g, v_base + interval '10 minutes',
    v_base + interval '60 minutes', 'Missed Stop', 'scheduled',
    40.9, -75.9, 'America/New_York', true
  );
  perform private.process_hands_free_live_schedule(v_base + interval '30 minutes');
  perform pg_temp.assert_true(
    (select is_open is false from public.trucks where id = v_truck_g),
    'missed stop should remain offline'
  );
  perform pg_temp.assert_true(
    (select auto_start_outcome = 'missed_start_window'
     from public.upcoming_stops where id = v_stop_g),
    'missed stop should expose its outcome'
  );

  -- Owner RPC validates inputs and never accepts lifecycle values.
  insert into public.upcoming_stops (
    id, truck_id, starts_at, ends_at, location_text, status
  ) values (
    v_stop_h, v_truck_h, statement_timestamp() + interval '2 hours',
    statement_timestamp() + interval '3 hours', 'Owner RPC Stop', 'scheduled'
  );

  perform public.configure_upcoming_stop_live_automation(
    v_stop_h, true, 41.0, -76.0, 'America/New_York'
  );
  perform pg_temp.assert_true(
    (select auto_manage_live and latitude = 41.0 and timezone = 'America/New_York'
     from public.upcoming_stops where id = v_stop_h),
    'owner RPC should safely arm a valid stop'
  );

  begin
    perform public.configure_upcoming_stop_live_automation(
      v_stop_h, true, 91.0, -76.0, 'America/New_York'
    );
    raise exception 'invalid coordinates unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  perform public.set_hands_free_live_confirmation_notifications(false);
  perform pg_temp.assert_true(
    (select notify_hands_free_live_confirmations is false
     from public.profiles where id = v_owner_a),
    'owner confirmation preference should be optional'
  );

  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  begin
    perform public.configure_upcoming_stop_live_automation(
      v_stop_h, false, null, null, null
    );
    raise exception 'cross-owner configuration unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'public.process_hands_free_live_schedule()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.process_hands_free_live_schedule()', 'EXECUTE')
    and has_function_privilege('service_role', 'public.process_hands_free_live_schedule()', 'EXECUTE'),
    'processor execution boundary should be service-role only'
  );
  perform pg_temp.assert_true(
    not has_function_privilege(
      'anon',
      'public.reconcile_hands_free_live_notification_deliveries()',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.reconcile_hands_free_live_notification_deliveries()',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.reconcile_hands_free_live_notification_deliveries()',
      'EXECUTE'
    ),
    'notification reconciliation should be service-role only'
  );
  perform pg_temp.assert_true(
    not has_function_privilege(
      'anon',
      'public.claim_hands_free_live_notification_delivery(uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.claim_hands_free_live_notification_delivery(uuid)',
      'EXECUTE'
    )
    and has_function_privilege(
      'service_role',
      'public.claim_hands_free_live_notification_delivery(uuid)',
      'EXECUTE'
    ),
    'notification retry claims should be service-role only'
  );
  perform pg_temp.assert_true(
    not has_function_privilege(
      'anon',
      'public.configure_upcoming_stop_live_automation(uuid,boolean,double precision,double precision,text)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.configure_upcoming_stop_live_automation(uuid,boolean,double precision,double precision,text)',
      'EXECUTE'
    ),
    'configuration RPC should be authenticated-only'
  );
  perform pg_temp.assert_true(
    not has_column_privilege('anon', 'public.upcoming_stops', 'auto_start_outcome', 'SELECT')
    and not has_column_privilege('authenticated', 'public.upcoming_stops', 'auto_start_outcome', 'SELECT')
    and not has_column_privilege('authenticated', 'public.upcoming_stops', 'auto_manage_live', 'UPDATE'),
    'internal automation fields should remain hidden and protected'
  );
  perform pg_temp.assert_true(
    not has_table_privilege('authenticated', 'public.truck_live_events', 'INSERT'),
    'authenticated clients should not forge LIVE audit events'
  );
  perform pg_temp.assert_true(
    not has_schema_privilege('anon', 'private', 'USAGE')
    and not has_schema_privilege('authenticated', 'private', 'USAGE'),
    'clients should not access private processor state'
  );
  perform pg_temp.assert_true(
    not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT')
    and not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT'),
    'clients should not read Vault secrets'
  );

  -- The existing minute processor marks abandoned delivery claims observable.
  -- A replay can reclaim only failed work, and the attempt counter gives the
  -- Edge Function a CAS guard against a late prior attempt.
  select e.id
  into v_event_id
  from public.truck_live_events e
  where e.stop_id = v_stop_c
    and e.action = 'go_live'
    and e.source = 'schedule'
  limit 1;

  insert into public.hands_free_live_notification_deliveries (
    event_id, status, attempt_count, claimed_at
  ) values (
    v_event_id, 'processing', 1, statement_timestamp() - interval '3 minutes'
  );

  select public.process_hands_free_live_schedule()
  into v_result;
  perform pg_temp.assert_true(
    (v_result ->> 'stale_notification_deliveries_failed')::integer = 1,
    'minute processor should sweep one stale notification claim'
  );
  perform pg_temp.assert_true(
    (select status = 'failed'
       and error = 'Processing timeout after 2 minutes'
       and attempt_count = 1
     from public.hands_free_live_notification_deliveries
     where event_id = v_event_id),
    'stale delivery should be observable as a timed-out failure'
  );

  select c.claimed, c.attempt_count
  into v_claimed, v_attempt_count
  from public.claim_hands_free_live_notification_delivery(v_event_id) c;
  perform pg_temp.assert_true(
    v_claimed and v_attempt_count = 2,
    'replay should reclaim a failed delivery as attempt two'
  );

  select c.claimed, c.attempt_count
  into v_claimed, v_attempt_count
  from public.claim_hands_free_live_notification_delivery(v_event_id) c;
  perform pg_temp.assert_true(
    not v_claimed and v_attempt_count = 2,
    'an active retry must not be claimed twice'
  );

  update public.hands_free_live_notification_deliveries
  set status = 'completed'
  where event_id = v_event_id
    and attempt_count = 1
    and status = 'processing';
  get diagnostics v_rows = row_count;
  perform pg_temp.assert_true(
    v_rows = 0,
    'a late first attempt must not overwrite the active retry'
  );

  -- The kill switch blocks new starts but must still close sessions already
  -- owned by scheduled automation.
  update private.hands_free_live_settings
  set enabled = false
  where singleton is true;
  select private.process_hands_free_live_schedule(v_base + interval '76 minutes')
  into v_result;
  perform pg_temp.assert_true(
    (v_result ->> 'disabled')::boolean
    and (v_result ->> 'ends_changed')::integer >= 1,
    'disabled mode should continue safe scheduled ends'
  );
  perform pg_temp.assert_true(
    (select is_open is false from public.trucks where id = v_truck_e),
    'kill switch must not strand the back-to-back scheduled session'
  );
end;
$$;

rollback;
