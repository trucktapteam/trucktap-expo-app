// Offline tests for notify-truck-announcement. The handler runs against an
// in-memory fake Supabase client and a recording push sender; no request ever
// leaves the process, so no real push notification can be sent.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAnnouncementHandler } from './handler.ts';
import {
  findDeliverableAnnouncement,
  selectRecipientTokens,
} from '../_shared/truckAnnouncement.ts';

const NOW = Date.parse('2026-11-06T15:00:00.000Z');
const TRUCK_A = '11111111-1111-4111-8111-111111111111';
const TRUCK_B = '22222222-2222-4222-8222-222222222222';
const MESSAGE = 'Brisket is back today until 3pm!';

const token = (name) => `ExponentPushToken[${name}]`;

const baseDb = () => ({
  users: {
    'jwt-owner-a': 'owner-a',
    'jwt-owner-b': 'owner-b',
    'jwt-customer': 'customer-1',
    'jwt-admin': 'admin-1',
  },
  trucks: [
    {
      id: TRUCK_A,
      owner_id: 'owner-a',
      announcements: [
        { id: 'ann-old', truck_id: TRUCK_A, message: 'Older news', timestamp: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() },
        { id: 'ann-new', truck_id: TRUCK_A, message: MESSAGE, timestamp: new Date(NOW - 30 * 1000).toISOString(), expires_at: new Date(NOW + 7 * 24 * 3600 * 1000).toISOString() },
      ],
    },
    { id: TRUCK_B, owner_id: 'owner-b', announcements: [] },
  ],
  profiles: [
    { id: 'owner-a', role: 'truck', notify_announcements: true, push_token: token('owner-a') },
    { id: 'owner-b', role: 'truck', notify_announcements: true, push_token: token('owner-b') },
    { id: 'customer-1', role: 'customer', notify_announcements: true, push_token: token('customer-1') },
    { id: 'follower-on', role: 'customer', notify_announcements: true, push_token: token('follower-on') },
    { id: 'follower-off', role: 'customer', notify_announcements: false, push_token: token('follower-off') },
    { id: 'follower-no-token', role: 'customer', notify_announcements: true, push_token: null },
    { id: 'follower-bad-token', role: 'customer', notify_announcements: true, push_token: 'not-a-token' },
    { id: 'follower-dup-device', role: 'customer', notify_announcements: true, push_token: token('follower-on') },
    { id: 'non-follower', role: 'customer', notify_announcements: true, push_token: token('non-follower') },
    { id: 'admin-1', role: 'admin', notify_announcements: true, push_token: token('admin-1') },
  ],
  favorites: [
    { user_id: 'follower-on', truck_id: TRUCK_A },
    { user_id: 'follower-off', truck_id: TRUCK_A },
    { user_id: 'follower-no-token', truck_id: TRUCK_A },
    { user_id: 'follower-bad-token', truck_id: TRUCK_A },
    { user_id: 'follower-dup-device', truck_id: TRUCK_A },
    { user_id: 'owner-a', truck_id: TRUCK_A },
    { user_id: 'non-follower', truck_id: TRUCK_B },
  ],
});

// Supports exactly the query shapes the handler uses.
const fakeAdmin = (db) => ({
  auth: {
    getUser: async (jwt) => {
      const id = db.users[jwt];
      return id
        ? { data: { user: { id } }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT' } };
    },
  },
  from(table) {
    let rows = [...(db[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column, value) => { rows = rows.filter((row) => row[column] === value); return builder; },
      in: (column, values) => { rows = rows.filter((row) => values.includes(row[column])); return builder; },
      not: (column, op, value) => {
        assert.equal(op, 'is');
        assert.equal(value, null);
        rows = rows.filter((row) => row[column] !== null && row[column] !== undefined);
        return builder;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    return builder;
  },
});

const setup = (overrides = {}) => {
  const db = overrides.db ?? baseDb();
  const sent = [];
  const handler = createAnnouncementHandler({
    createAdminClient: overrides.createAdminClient ?? (() => fakeAdmin(db)),
    sendPush: async (messages) => {
      sent.push(...messages);
      return overrides.pushResult ?? { ok: true, errorCount: 0 };
    },
    now: () => NOW,
  });
  return { db, sent, handler };
};

const request = ({ jwt, body = { truckId: TRUCK_A, message: MESSAGE }, method = 'POST', rawBody } = {}) =>
  new Request('https://example.invalid/functions/v1/notify-truck-announcement', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: method === 'GET' ? undefined : rawBody ?? JSON.stringify(body),
  });

test('missing credentials are rejected without touching the database or push', async () => {
  let clientCreated = false;
  const { sent, handler } = setup({ createAdminClient: () => { clientCreated = true; return null; } });
  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.equal(clientCreated, false);
  assert.equal(sent.length, 0);
});

test('malformed Authorization header is rejected', async () => {
  const { sent, handler } = setup();
  const response = await handler(new Request('https://example.invalid', {
    method: 'POST',
    headers: { Authorization: 'Basic abc' },
    body: JSON.stringify({ truckId: TRUCK_A, message: MESSAGE }),
  }));
  assert.equal(response.status, 401);
  assert.equal(sent.length, 0);
});

test('invalid credentials (including the bare anon key) are rejected', async () => {
  const { sent, handler } = setup();
  for (const jwt of ['not-a-real-session', 'eyJ-legacy-anon-key-has-no-user']) {
    const response = await handler(request({ jwt }));
    assert.equal(response.status, 401);
  }
  assert.equal(sent.length, 0);
});

test('non-POST methods are rejected', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({ jwt: 'jwt-owner-a', method: 'GET' }));
  assert.equal(response.status, 405);
  assert.equal(sent.length, 0);
});

test('a customer cannot send an announcement for a truck', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({ jwt: 'jwt-customer' }));
  assert.equal(response.status, 403);
  assert.equal(sent.length, 0);
});

test("an owner cannot send for another owner's truck", async () => {
  const { sent, handler } = setup();
  const response = await handler(request({ jwt: 'jwt-owner-b' }));
  assert.equal(response.status, 403);
  assert.equal(sent.length, 0);
});

test('unknown truck is forbidden, not an information leak', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({
    jwt: 'jwt-owner-a',
    body: { truckId: '99999999-9999-4999-8999-999999999999', message: MESSAGE },
  }));
  assert.equal(response.status, 403);
  assert.equal(sent.length, 0);
});

test('authorized owner reaches only opted-in followers with valid, unique tokens', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { success: true, recipients: 1, errorCount: 0 });

  assert.deepEqual(sent.map((m) => m.to), [token('follower-on')]);
  assert.equal(sent[0].title, 'New Truck Update 🚚');
  assert.equal(sent[0].body, MESSAGE);
  assert.deepEqual(sent[0].data, { truckId: TRUCK_A, truck_id: TRUCK_A });
});

test('follower who disabled announcement notifications is excluded', async () => {
  const { sent, handler } = setup();
  await handler(request({ jwt: 'jwt-owner-a' }));
  assert.ok(!sent.some((m) => m.to === token('follower-off')));
});

test('customer who did not favorite the truck is excluded', async () => {
  const { sent, handler } = setup();
  await handler(request({ jwt: 'jwt-owner-a' }));
  assert.ok(!sent.some((m) => m.to === token('non-follower')));
  assert.ok(!sent.some((m) => m.to === token('customer-1')));
});

test('the sender never receives their own announcement', async () => {
  const { sent, handler } = setup();
  await handler(request({ jwt: 'jwt-owner-a' }));
  assert.ok(!sent.some((m) => m.to === token('owner-a')));
});

test('an admin may announce for any truck, still followers only', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({ jwt: 'jwt-admin' }));
  assert.equal(response.status, 200);
  // owner-a favorited their own truck; with an admin as sender they are a
  // normal opted-in follower. The admin (not a follower) receives nothing.
  assert.deepEqual(sent.map((m) => m.to).sort(), [token('follower-on'), token('owner-a')].sort());
  assert.ok(!sent.some((m) => m.to === token('admin-1')));
});

test('caller-supplied recipients or extra fields are ignored', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({
    jwt: 'jwt-owner-a',
    body: {
      truckId: TRUCK_A,
      message: MESSAGE,
      to: [token('non-follower')],
      recipients: ['non-follower'],
      userIds: ['customer-1'],
    },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(sent.map((m) => m.to), [token('follower-on')]);
});

test('arbitrary text that was never published is refused', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({
    jwt: 'jwt-owner-a',
    body: { truckId: TRUCK_A, message: 'Click this totally real link' },
  }));
  assert.equal(response.status, 409);
  assert.equal(sent.length, 0);
});

test('deleting an announcement cannot trigger a notification', async () => {
  // After deletion the app persists the remaining list and does not invoke
  // the function. Even if a stale or replayed request arrives, the deleted
  // message is no longer published, so nothing is sent.
  const db = baseDb();
  db.trucks[0].announcements = db.trucks[0].announcements.filter((a) => a.id !== 'ann-new');
  const { sent, handler } = setup({ db });
  const response = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.equal(response.status, 409);
  assert.equal(sent.length, 0);
});

test('re-pushing an older (non-newest) announcement is refused', async () => {
  const { sent, handler } = setup();
  const response = await handler(request({
    jwt: 'jwt-owner-a',
    body: { truckId: TRUCK_A, message: 'Older news' },
  }));
  assert.equal(response.status, 409);
  assert.equal(sent.length, 0);
});

test('an earlier message is refused once a newer one exists, even inside the window', async () => {
  const db = baseDb();
  db.trucks[0].announcements.push({
    id: 'ann-newer',
    message: 'Sold out of brisket, sorry!',
    timestamp: new Date(NOW - 5 * 1000).toISOString(),
  });
  const { sent, handler } = setup({ db });
  // MESSAGE was published 30 seconds ago (well inside the 60-minute window)
  // but is no longer the newest announcement.
  const stale = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.equal(stale.status, 409);
  assert.equal(sent.length, 0);

  const current = await handler(request({
    jwt: 'jwt-owner-a',
    body: { truckId: TRUCK_A, message: 'Sold out of brisket, sorry!' },
  }));
  assert.equal(current.status, 200);
  assert.equal(sent.length, 1);
});

test('a tie between different messages at the newest timestamp authorizes nothing', () => {
  const at = new Date(NOW - 1000).toISOString();
  const tied = [
    { message: MESSAGE, timestamp: at },
    { message: 'Different text', timestamp: at },
  ];
  assert.equal(findDeliverableAnnouncement(tied, MESSAGE, NOW), null);
  assert.equal(findDeliverableAnnouncement(tied, 'Different text', NOW), null);
  const sameText = [
    { message: MESSAGE, timestamp: at },
    { message: MESSAGE, timestamp: at },
  ];
  assert.ok(findDeliverableAnnouncement(sameText, MESSAGE, NOW));
});

test('the exact current message cannot be delivered by an unauthorized caller', async () => {
  // Window matching runs only after authentication and ownership checks.
  const { sent, handler } = setup();
  for (const jwt of [undefined, 'forged-token', 'jwt-customer', 'jwt-owner-b']) {
    const response = await handler(request({ jwt }));
    assert.ok([401, 403].includes(response.status), `unexpected ${response.status} for ${jwt}`);
  }
  assert.equal(sent.length, 0);
});

test('replaying the announcement after the freshness window sends nothing', async () => {
  const db = baseDb();
  db.trucks[0].announcements[1].timestamp = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
  const { sent, handler } = setup({ db });
  const response = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.equal(response.status, 409);
  assert.equal(sent.length, 0);
});

test('expired announcement is never delivered', async () => {
  const db = baseDb();
  db.trucks[0].announcements[1].expires_at = new Date(NOW - 1000).toISOString();
  const { sent, handler } = setup({ db });
  const response = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.equal(response.status, 409);
  assert.equal(sent.length, 0);
});

test('a single legitimate request sends exactly one push per device', async () => {
  const { sent, handler } = setup();
  await handler(request({ jwt: 'jwt-owner-a' }));
  const recipients = sent.map((m) => m.to);
  assert.equal(new Set(recipients).size, recipients.length);
});

test('a truck with no opted-in followers sends nothing and succeeds', async () => {
  const db = baseDb();
  db.trucks[1].announcements = [{ id: 'b1', message: MESSAGE, timestamp: new Date(NOW).toISOString() }];
  db.favorites = db.favorites.filter((f) => f.truck_id !== TRUCK_B);
  const { sent, handler } = setup({ db });
  const response = await handler(request({ jwt: 'jwt-owner-b', body: { truckId: TRUCK_B, message: MESSAGE } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, recipients: 0 });
  assert.equal(sent.length, 0);
});

test('invalid bodies are rejected after authentication', async () => {
  const { sent, handler } = setup();
  const cases = [
    request({ jwt: 'jwt-owner-a', rawBody: 'not json' }),
    request({ jwt: 'jwt-owner-a', body: { truckId: TRUCK_A } }),
    request({ jwt: 'jwt-owner-a', body: { truckId: 'not-a-uuid', message: MESSAGE } }),
    request({ jwt: 'jwt-owner-a', body: { truckId: TRUCK_A, message: 'x'.repeat(501) } }),
  ];
  for (const req of cases) {
    assert.equal((await handler(req)).status, 400);
  }
  assert.equal(sent.length, 0);
});

test('push provider failure is reported without leaking tokens', async () => {
  const { handler } = setup({ pushResult: { ok: false, errorCount: 1 } });
  const response = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.ok(!text.includes('ExponentPushToken'));
});

test('success responses never include push tokens', async () => {
  const { handler } = setup();
  const response = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.ok(!(await response.text()).includes('ExponentPushToken'));
});

test('missing server configuration fails closed after authentication check', async () => {
  const { sent, handler } = setup({ createAdminClient: () => null });
  const response = await handler(request({ jwt: 'jwt-owner-a' }));
  assert.equal(response.status, 500);
  assert.equal(sent.length, 0);
});

test('freshness tolerates normal device clock skew', () => {
  const stored = [{ message: MESSAGE, timestamp: new Date(NOW + 10 * 60 * 1000).toISOString() }];
  assert.ok(findDeliverableAnnouncement(stored, MESSAGE, NOW));
  const farFuture = [{ message: MESSAGE, timestamp: new Date(NOW + 3 * 60 * 60 * 1000).toISOString() }];
  assert.equal(findDeliverableAnnouncement(farFuture, MESSAGE, NOW), null);
  assert.equal(findDeliverableAnnouncement(null, MESSAGE, NOW), null);
});

test('recipient selection drops sender devices shared with other profiles', () => {
  const tokens = selectRecipientTokens([
    { id: 'owner', push_token: token('shared') },
    { id: 'stale-profile', push_token: token('shared') },
    { id: 'fan', push_token: ` ${token('fan')} ` },
  ], 'owner');
  assert.deepEqual(tokens, [token('fan')]);
});
