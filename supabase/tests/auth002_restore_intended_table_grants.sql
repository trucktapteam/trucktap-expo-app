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
  v_admin constant uuid := 'd5000000-0000-4000-8000-000000000001';
  v_owner constant uuid := 'd5000000-0000-4000-8000-000000000002';
  v_other_owner constant uuid := 'd5000000-0000-4000-8000-000000000003';
  v_reviewer constant uuid := 'd5000000-0000-4000-8000-000000000004';
  v_truck uuid;
  v_other_truck uuid;
  v_review uuid;
  v_reply uuid;
  v_message uuid;
  v_targeted_message uuid;
  v_count integer;
  v_rejected boolean;
  v_body text;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, created_at, updated_at
  ) values
    (v_admin, 'authenticated', 'authenticated', 'auth002-admin@example.test', '', now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'auth002-owner@example.test', '', now(), now()),
    (v_other_owner, 'authenticated', 'authenticated', 'auth002-other-owner@example.test', '', now(), now()),
    (v_reviewer, 'authenticated', 'authenticated', 'auth002-reviewer@example.test', '', now(), now());

  update public.profiles set role = 'admin' where id = v_admin;
  update public.profiles set role = 'truck' where id in (v_owner, v_other_owner);
  update public.profiles set role = 'customer' where id = v_reviewer;

  insert into public.trucks (owner_id, name) values (v_owner, 'AUTH-002 Owner Truck')
    returning id into v_truck;
  insert into public.trucks (owner_id, name) values (v_other_owner, 'AUTH-002 Other Truck')
    returning id into v_other_truck;

  -- 1. owner_messages: admin insert succeeds (the exact app payload from
  -- createOwnerMessage), non-admin insert is rejected by RLS (not a grant
  -- error -- the grant now exists, so denial must come from the policy).
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.owner_messages (title, body, type, created_by, target_scope)
    values ('Heads up', 'Scheduled maintenance', 'maintenance', v_admin, 'all_trucks')
    returning id into v_message;
  insert into public.owner_messages (title, body, type, created_by, target_scope, target_truck_id)
    values ('Truck specific', 'Just for you', 'general', v_admin, 'truck', v_truck)
    returning id into v_targeted_message;
  perform pg_temp.assert_true(v_message is not null and v_targeted_message is not null, 'an admin must be able to insert owner_messages (the AUTH-002 regression)');
  reset role;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_rejected := false;
  begin
    insert into public.owner_messages (title, body, type, created_by, target_scope)
      values ('Not allowed', 'Should be rejected', 'general', v_owner, 'all_trucks');
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'a non-admin must still be denied by RLS, not the grant, when inserting owner_messages');

  -- 2. owner_messages: owner select(*) works (the exact app query from
  -- refreshOwnerMessages), and returns the truck-targeted message since it
  -- targets this owner's truck.
  select count(*) into v_count from public.owner_messages where id in (v_message, v_targeted_message);
  perform pg_temp.assert_true(v_count = 2, 'the owner must be able to read both the all_trucks message and the message targeted at their own truck');
  reset role;

  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.owner_messages where id = v_targeted_message;
  perform pg_temp.assert_true(v_count = 0, 'an owner whose truck was not targeted must not see a truck-scoped message meant for someone else');
  reset role;

  -- 3. owner_message_reads: the exact upsert from markOwnerUpdatesViewed,
  -- and the exact select from refreshOwnerMessages.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.owner_message_reads (message_id, user_id, read_at)
    values (v_message, v_owner, now())
    on conflict (message_id, user_id) do update set read_at = excluded.read_at;
  perform pg_temp.assert_true(found, 'marking an owner message read (insert path) must succeed (the AUTH-002 regression)');

  insert into public.owner_message_reads (message_id, user_id, read_at)
    values (v_message, v_owner, now())
    on conflict (message_id, user_id) do update set read_at = excluded.read_at;
  perform pg_temp.assert_true(found, 're-marking an owner message read (the ON CONFLICT DO UPDATE path) must succeed');

  select count(*) into v_count from public.owner_message_reads where user_id = v_owner and message_id in (v_message);
  perform pg_temp.assert_true(v_count = 1, 'the owner must be able to read back their own read receipt');
  reset role;

  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.owner_message_reads where user_id = v_owner;
  perform pg_temp.assert_true(v_count = 0, 'an owner must not be able to read another owner''s read receipts');
  reset role;

  -- 4. review_replies: the exact insert/update/soft-delete payloads from
  -- addReviewReply / updateReviewReply / deleteReviewReply.
  perform set_config('request.jwt.claim.sub', v_reviewer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.reviews (truck_id, user_id, rating, text)
    values (v_truck, v_reviewer, 5, 'Great truck')
    returning id into v_review;
  reset role;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.review_replies (review_id, truck_id, owner_id, body)
    values (v_review, v_truck, v_owner, 'Thanks for the review!')
    returning id into v_reply;
  perform pg_temp.assert_true(v_reply is not null, 'the truck owner must be able to insert a review reply (the AUTH-002 regression)');

  update public.review_replies set body = 'Thanks for the review! (edited)'
    where id = v_reply and deleted_at is null
    returning body into v_body;
  perform pg_temp.assert_true(v_body = 'Thanks for the review! (edited)', 'the truck owner must be able to update their own review reply body');

  update public.review_replies set deleted_at = now()
    where id = v_reply and deleted_at is null;
  perform pg_temp.assert_true(found, 'the truck owner must be able to soft-delete their own review reply');
  reset role;

  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_rejected := false;
  begin
    insert into public.review_replies (review_id, truck_id, owner_id, body)
      values (v_review, v_truck, v_other_owner, 'I do not own this truck');
  exception
    when insufficient_privilege then
      v_rejected := true;
  end;
  perform pg_temp.assert_true(
    v_rejected,
    'an authenticated user who does not own the truck must still be denied by RLS, not the grant, when inserting a review reply'
  );
  -- owner_id is intentionally not part of this count filter: it has no
  -- SELECT grant (see assertion 5a below), matching that the app's own
  -- query for this table never selects or filters on it either. Expected
  -- count is 0, not 1: v_reply was already soft-deleted by its owner in
  -- section 4 above, and "Public can read active review replies" (the
  -- only policy v_other_owner qualifies under here) filters deleted_at is
  -- null, so even the pre-existing row is invisible to this actor.
  select count(*) into v_count from public.review_replies where review_id = v_review;
  perform pg_temp.assert_true(
    v_count = 0,
    'the rejected insert must not have added a visible reply row, and the earlier soft-deleted reply stays invisible to this actor'
  );
  reset role;

  -- 5. review_replies: no real DELETE is granted, matching that no client
  -- path performs one (only soft-delete via UPDATE). Confirm authenticated
  -- still cannot execute a real DELETE, so this migration did not
  -- accidentally grant more than the app uses.
  perform pg_temp.assert_true(
    not has_table_privilege('authenticated', 'public.review_replies', 'DELETE'),
    'authenticated must not have a real DELETE grant on review_replies -- the app only ever soft-deletes via UPDATE'
  );
  -- review_replies.owner_id also has no SELECT grant (pre-existing, not
  -- touched by AUTH-002): app/(truck)/reviews.tsx's select() never
  -- projects or filters on it, so it is correctly excluded under
  -- "grant only what the app uses" rather than added here.
  perform pg_temp.assert_true(
    not has_column_privilege('authenticated', 'public.review_replies', 'owner_id', 'SELECT'),
    'review_replies.owner_id intentionally has no SELECT grant since no client query needs it'
  );

  -- 6. upcoming_stops and truck_live_events must be untouched by this
  -- migration. upcoming_stops' SELECT/INSERT/UPDATE are column-level
  -- grants (has_table_privilege() does not see those -- only
  -- has_column_privilege() does), so the app's exact columns are checked
  -- directly, plus a live insert/update using the exact app payload
  -- shapes, matching what was already proven to work before AUTH-002.
  perform pg_temp.assert_true(
    has_column_privilege('authenticated', 'public.upcoming_stops', 'location_text', 'SELECT')
    and has_column_privilege('authenticated', 'public.upcoming_stops', 'location_text', 'INSERT')
    and has_column_privilege('authenticated', 'public.upcoming_stops', 'location_text', 'UPDATE')
    and has_table_privilege('authenticated', 'public.upcoming_stops', 'DELETE'),
    'upcoming_stops grants for authenticated must remain exactly as they already were (not touched by AUTH-002)'
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.upcoming_stops (truck_id, starts_at, ends_at, location_text, note, status)
    values (v_truck, now() + interval '1 day', now() + interval '1 day 2 hours', 'Main St', 'note', 'scheduled');
  perform pg_temp.assert_true(found, 'upcoming_stops insert with the app''s exact columns must still work, unaffected by AUTH-002');
  reset role;

  perform pg_temp.assert_true(
    not has_table_privilege('authenticated', 'public.truck_live_events', 'INSERT'),
    'truck_live_events must remain without an INSERT grant for authenticated -- writes are RPC-only by design'
  );

  reset role;
end;
$$;

rollback;

\echo 'AUTH-002 restored table grant tests passed'
