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
  v_admin constant uuid := 'b5000000-0000-4000-8000-000000000001';
  v_owner constant uuid := 'b5000000-0000-4000-8000-000000000002';
  v_other_owner constant uuid := 'b5000000-0000-4000-8000-000000000003';
  v_truck uuid;
  v_other_truck uuid;
  v_stop uuid;
  v_row public.trucks;
  v_loc public.locations;
  v_count integer;
  v_rejected boolean;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_admin, 'authenticated', 'authenticated', 'bridge-admin@example.test', '', now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'bridge-owner@example.test', '', now(), now()),
    (v_other_owner, 'authenticated', 'authenticated', 'bridge-other-owner@example.test', '', now(), now());

  update public.profiles set role = 'admin' where id = v_admin;
  update public.profiles set role = 'truck' where id in (v_owner, v_other_owner);

  insert into public.trucks (owner_id, name) values (v_owner, 'Bridge Test Truck')
    returning id into v_truck;
  insert into public.trucks (owner_id, name) values (v_other_owner, 'Bridge Other Truck')
    returning id into v_other_truck;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.upcoming_stops (truck_id, starts_at, ends_at, location_text, note, status)
    values (v_truck, now() + interval '1 day', now() + interval '1 day 2 hours', 'Main St', 'note', 'scheduled')
    returning id into v_stop;
  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 14 (partial). Trigger ordering, structural check. The real proof is
  -- behavioral: scenarios 1 and 5 below cannot succeed at all unless each
  -- bridge trigger genuinely fires before its guard.
  -- ==========================================================
  perform pg_temp.assert_true(
    (select tgname from pg_trigger where tgrelid = 'public.trucks'::regclass and tgname = 'bridge_legacy_live_state') <
    (select tgname from pg_trigger where tgrelid = 'public.trucks'::regclass and tgname = 'guard_truck_live_state'),
    'bridge_legacy_live_state must sort before guard_truck_live_state'
  );
  perform pg_temp.assert_true(
    (select tgname from pg_trigger where tgrelid = 'public.locations'::regclass and tgname = 'bridge_legacy_open_truck_location') <
    (select tgname from pg_trigger where tgrelid = 'public.locations'::regclass and tgname = 'guard_open_truck_location'),
    'bridge_legacy_open_truck_location must sort before guard_open_truck_location'
  );

  -- ==========================================================
  -- 1, 3, 14. Legacy Go LIVE: the exact raw shape, as the owner, with no
  -- RPC involved. Succeeding at all is itself proof bridge_legacy_live_state
  -- fired before guard_truck_live_state (otherwise guard would reject this
  -- unconditionally, since the GUC is unset for a raw client write).
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.trucks set is_open = true, updated_at = now() where id = v_truck
    returning * into v_row;

  perform pg_temp.assert_true(v_row.is_open is true, 'legacy go-live update must succeed (the bridge must let it through)');

  -- 3. Lifecycle field population, matching what go_live_truck would produce.
  perform pg_temp.assert_true(v_row.live_started_at is not null, 'live_started_at must be populated');
  perform pg_temp.assert_true(v_row.last_live_updated_at is not null, 'last_live_updated_at must be populated');
  perform pg_temp.assert_true(v_row.live_started_at = v_row.last_live_updated_at, 'live_started_at and last_live_updated_at must match on go-live');
  perform pg_temp.assert_true(v_row.live_expires_at = v_row.live_started_at + interval '12 hours', 'live_expires_at must be exactly a 12 hour window');
  perform pg_temp.assert_true(v_row.live_source = 'legacy_bridge', 'live_source must be tagged legacy_bridge, distinct from manual/schedule/legacy_backfill');
  perform pg_temp.assert_true(v_row.live_stop_id is null, 'a legacy write can never claim scheduled-automation stop ownership');

  -- 3/4. Exactly one authoritative audit row.
  select count(*) into v_count
  from public.truck_live_events
  where truck_id = v_truck and action = 'go_live' and source = 'legacy_bridge';
  perform pg_temp.assert_true(v_count = 1, 'exactly one authoritative go_live audit row must exist after the bridge fires');

  -- ==========================================================
  -- 5, 14. Legacy location upsert immediately after the bridged go-live,
  -- same truck, same owner, exact legacy shape. Succeeding is proof
  -- bridge_legacy_open_truck_location fired before guard_open_truck_location.
  -- ==========================================================
  insert into public.locations (truck_id, latitude, longitude, label)
    values (v_truck, 39.9526, -75.1652, 'Legacy Location')
    on conflict (truck_id) do update
      set latitude = excluded.latitude, longitude = excluded.longitude, label = excluded.label
    returning * into v_loc;
  perform pg_temp.assert_true(v_loc.latitude = 39.9526, 'legacy location upsert for the just-bridged truck must succeed');

  -- Re-upsert (UPDATE path this time) must also succeed, same window.
  insert into public.locations (truck_id, latitude, longitude, label)
    values (v_truck, 39.95, -75.16, 'Legacy Location 2')
    on conflict (truck_id) do update
      set latitude = excluded.latitude, longitude = excluded.longitude, label = excluded.label
    returning * into v_loc;
  perform pg_temp.assert_true(v_loc.label = 'Legacy Location 2', 'a second legacy location upsert (UPDATE path) within the window must also succeed');

  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 7. Duplicate legacy event suppression: the legacy client's own
  -- immediately-following truck_live_events insert. There is no dedup
  -- trigger here (see the design-tradeoff comment in the migration header)
  -- -- 20260718020000_hands_free_live_scheduled_automation.sql's existing
  -- revoke of authenticated's direct INSERT on this table is deliberately
  -- left in place, so this call is rejected at the grant level before any
  -- row is ever created, regardless of whether it would have "matched" a
  -- bridged event or not. No duplicate row is possible.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_rejected := false;
  begin
    insert into public.truck_live_events (truck_id, action, source, actor_user_id, metadata)
      values (v_truck, 'go_live', 'manual', v_owner, jsonb_build_object('rpc', 'legacy-client-followup'));
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'the legacy client''s own matching follow-up insert must be rejected at the grant level, never creating a second row');

  select count(*) into v_count
  from public.truck_live_events
  where truck_id = v_truck and action = 'go_live';
  perform pg_temp.assert_true(v_count = 1, 'exactly one row must exist -- the bridge''s authoritative event, no duplicate from the follow-up attempt');
  reset role;
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 8. Forged/mismatched event rejection: the same grant boundary rejects
  -- both a cross-owner forgery attempt (also independently blocked by RLS,
  -- defense in depth) and an unrelated-action attempt -- uniformly, since
  -- there is no per-row matching logic left to distinguish them.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_rejected := false;
  begin
    insert into public.truck_live_events (truck_id, action, source, actor_user_id, metadata)
      values (v_truck, 'go_live', 'manual', v_other_owner, '{}'::jsonb);
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'a non-owner forgery attempt must be rejected (grant boundary, and independently RLS)');
  reset role;
  perform set_config('trucktap.canonical_live_transition', '', true);

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_rejected := false;
  begin
    insert into public.truck_live_events (truck_id, action, source, actor_user_id, metadata)
      values (v_truck, 'go_offline', 'manual', v_owner, '{}'::jsonb);
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'an unrelated-action direct insert attempt must be rejected the same way, even for the truck''s real owner');
  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 2. Legacy Go OFFLINE: the exact raw shape, same truck.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.trucks set is_open = false, updated_at = now() where id = v_truck
    returning * into v_row;

  perform pg_temp.assert_true(v_row.is_open is false, 'legacy go-offline update must succeed');
  perform pg_temp.assert_true(v_row.live_expires_at is null, 'live_expires_at must be cleared on go-offline');
  perform pg_temp.assert_true(v_row.live_stop_id is null, 'live_stop_id must be cleared on go-offline');
  perform pg_temp.assert_true(v_row.live_source = 'legacy_bridge', 'live_source must be tagged legacy_bridge on the bridged offline transition too');
  perform pg_temp.assert_true(v_row.live_started_at is not null, 'live_started_at must be preserved as session history, not cleared, on go-offline');

  select count(*) into v_count
  from public.truck_live_events
  where truck_id = v_truck and action = 'go_offline' and source = 'legacy_bridge';
  perform pg_temp.assert_true(v_count = 1, 'exactly one authoritative go_offline audit row must exist');

  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 15a. Rapid/redundant transitions: a legacy write that does not actually
  -- change is_open (already false, set to false again) must be a true
  -- no-op -- no re-bridging, no new audit row.
  -- ==========================================================
  select count(*) into v_count from public.truck_live_events where truck_id = v_truck;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.trucks set is_open = false, updated_at = now() where id = v_truck;
  reset role;
  perform pg_temp.assert_true(
    (select count(*) from public.truck_live_events where truck_id = v_truck) = v_count,
    'a redundant is_open=false write when already offline must not create a new audit row'
  );

  -- ==========================================================
  -- 15b. Rapid/sequential re-transition: go live again immediately after,
  -- must bridge cleanly with fresh values and its own independent audit row.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.trucks set is_open = true, updated_at = now() where id = v_truck
    returning * into v_row;
  reset role;
  perform pg_temp.assert_true(v_row.live_source = 'legacy_bridge', 'a rapid re-live must bridge cleanly again');
  select count(*) into v_count
  from public.truck_live_events
  where truck_id = v_truck and action = 'go_live' and source = 'legacy_bridge';
  perform pg_temp.assert_true(v_count = 2, 'the second bridged go_live must produce its own independent audit row (2 total across both go-lives in this test)');

  -- ==========================================================
  -- 6. Unrelated location write rejection: v_other_truck is opened
  -- canonically (manual, not legacy_bridge) -- its owner's own direct
  -- location write must still be rejected; no exemption applies.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.go_live_truck(v_other_truck, 'manual', 39.9, -75.1, 'Canonical Location', '{}'::jsonb);
  -- go_live_truck's own canonical transition set the GUC to 'on' for its
  -- own statement; reset here too so the following raw attempt is not
  -- masked by that leak (see the boundary-reset comment above).
  perform set_config('trucktap.canonical_live_transition', '', true);

  v_rejected := false;
  begin
    update public.locations set latitude = 1.0 where truck_id = v_other_truck;
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'a direct location write on a canonically (non-bridge) live truck must still be rejected -- no broad exemption');
  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 9. Cross-owner RLS rejection: v_other_owner attempting the legacy shape
  -- against v_owner's truck.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.trucks set is_open = false, updated_at = now() where id = v_truck;
  get diagnostics v_count = row_count;
  perform pg_temp.assert_true(v_count = 0, 'a non-owner''s legacy-shaped update must affect zero rows (RLS boundary, before the bridge ever sees it)');
  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 10. Mixed payload rejection: is_open changes alongside an unrelated
  -- column in the same statement -- must not be bridged.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_rejected := false;
  begin
    update public.trucks
    set is_open = false, updated_at = now(), name = 'Renamed While Toggling'
    where id = v_truck;
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'a mixed payload (is_open plus an unrelated column) must fall through to the original hard reject');
  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 11. Direct lifecycle-field modification rejection: forging live_stop_id
  -- without touching is_open.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_rejected := false;
  begin
    update public.trucks set live_stop_id = v_stop where id = v_truck;
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'directly forging live_stop_id must still be rejected, unaffected by the bridge');
  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 12. Canonical RPC non-interference: go_live_truck / go_offline_truck
  -- behave exactly as before, tagged manual, not legacy_bridge.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.trucks set is_open = false, updated_at = now() where id = v_truck;

  v_row := public.go_live_truck(v_truck, 'manual', 39.95, -75.16, 'Canonical Owner Location', '{}'::jsonb);
  perform pg_temp.assert_true(v_row.live_source = 'manual', 'canonical go_live_truck must still tag manual, never legacy_bridge');
  perform pg_temp.assert_true(v_row.live_expires_at = v_row.live_started_at + interval '12 hours', 'canonical RPC lifecycle math must be unaffected by the bridge');

  v_row := public.go_offline_truck(v_truck, 'manual', '{}'::jsonb);
  perform pg_temp.assert_true(v_row.is_open is false, 'canonical go_offline_truck must still work exactly as before');
  perform pg_temp.assert_true(v_row.live_source = 'manual', 'canonical go_offline_truck must still tag manual');

  select count(*) into v_count
  from public.truck_live_events
  where truck_id = v_truck and source = 'manual';
  perform pg_temp.assert_true(v_count = 2, 'canonical RPC calls must still each write exactly one audit row, undisturbed by this migration');
  reset role;
  -- Each real legacy network call is its own transaction, so
  -- trucktap.canonical_live_transition naturally resets between them. This
  -- single enclosing test transaction does not reset it on its own -- reset
  -- explicitly here to accurately simulate that boundary before the next
  -- scenario, otherwise a GUC value set by one scenario would incorrectly
  -- leak into and mask the next.
  perform set_config('trucktap.canonical_live_transition', '', true);

  -- ==========================================================
  -- 13. Cleanup behavior: a fresh bridge-open truck is not stale
  -- immediately; an artificially-expired bridged session is closed by the
  -- ordinary (Phase 1A) canonical cleanup path.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.trucks set is_open = true, updated_at = now() where id = v_truck
    returning * into v_row;
  reset role;
  perform pg_temp.assert_true(v_row.live_source = 'legacy_bridge', 'setup: truck must be bridge-live before the cleanup checks');

  set local role service_role;
  perform public.close_stale_open_trucks();
  reset role;
  select is_open into v_row.is_open from public.trucks where id = v_truck;
  perform pg_temp.assert_true(v_row.is_open is true, 'a freshly bridged session (12h expiry) must not be closed by cleanup yet');

  -- Backdate as the canonical transition owner (test-only setup, mirrors
  -- 20260718070000's own technique), then confirm cleanup closes it through
  -- the real canonical transition, with a real audit event.
  perform set_config('trucktap.canonical_live_transition', 'on', true);
  update public.trucks
  set live_expires_at = now() - interval '1 minute'
  where id = v_truck;

  set local role service_role;
  perform public.close_stale_open_trucks();
  reset role;

  select is_open into v_row.is_open from public.trucks where id = v_truck;
  perform pg_temp.assert_true(v_row.is_open is false, 'an expired bridged session must be closed by the existing Phase 1A cleanup path, unmodified by this migration');

  select count(*) into v_count
  from public.truck_live_events
  where truck_id = v_truck and action = 'go_offline' and source = 'expiration';
  perform pg_temp.assert_true(v_count >= 1, 'cleanup-driven closure of a bridged session must still write its normal expiration audit event');

  raise notice 'legacy_live_compatibility_bridge tests passed (note: scenario 15 concurrent-session testing is approximated sequentially -- see report for the limitation)';
end;
$$;

rollback;

\echo 'legacy_live_compatibility_bridge tests passed'
