import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  authorizeDatabaseNotificationWebhook,
  canSendTruckAnnouncement,
  getBearerToken,
  secretsMatch,
} from './_shared/notificationAuth.ts';

const SECRET = 'unit-test-database-notification-secret';

test('database webhook authentication fails closed', async () => {
  const missing = await authorizeDatabaseNotificationWebhook(
    new Request('https://example.invalid', { method: 'POST' }),
    SECRET,
  );
  assert.equal(missing?.status, 401);

  const incorrect = await authorizeDatabaseNotificationWebhook(
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { 'x-trucktap-webhook-secret': 'incorrect' },
    }),
    SECRET,
  );
  assert.equal(incorrect?.status, 401);

  const valid = await authorizeDatabaseNotificationWebhook(
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { 'x-trucktap-webhook-secret': SECRET },
    }),
    SECRET,
  );
  assert.equal(valid, null);
  assert.equal(await secretsMatch(SECRET, SECRET), true);
});

test('announcement bearer parsing rejects missing and malformed credentials', () => {
  assert.equal(
    getBearerToken(new Request('https://example.invalid')),
    null,
  );
  assert.equal(
    getBearerToken(new Request('https://example.invalid', {
      headers: { authorization: 'Basic unsupported' },
    })),
    null,
  );
  assert.equal(
    getBearerToken(new Request('https://example.invalid', {
      headers: { authorization: 'Bearer valid-token' },
    })),
    'valid-token',
  );
});

test('announcement authority is limited to the truck owner or an admin', () => {
  assert.equal(canSendTruckAnnouncement('owner', 'owner', 'truck'), true);
  assert.equal(canSendTruckAnnouncement('admin', 'someone-else', 'admin'), true);
  assert.equal(canSendTruckAnnouncement('attacker', 'owner', 'customer'), false);
  assert.equal(canSendTruckAnnouncement('attacker', null, 'customer'), false);
});

test('all service-role notification handlers authorize before creating a client', () => {
  for (const name of [
    'notify-new-favorite',
    'notify-new-review',
    'notify-new-truck',
  ]) {
    const source = fs.readFileSync(
      new URL(`./${name}/index.ts`, import.meta.url),
      'utf8',
    );
    const authorization = source.indexOf('authorizeDatabaseNotificationWebhook');
    const serviceClient = source.indexOf('createClient(');
    assert.ok(authorization >= 0, `${name} has no webhook authorization`);
    assert.ok(
      serviceClient > authorization,
      `${name} creates a service client before authorization`,
    );
  }

  const announcement = fs.readFileSync(
    new URL('./notify-truck-announcement/index.ts', import.meta.url),
    'utf8',
  );
  assert.ok(announcement.indexOf('getBearerToken') >= 0);
  assert.ok(announcement.indexOf('admin.auth.getUser(token)') >= 0);
  assert.ok(announcement.indexOf('canSendTruckAnnouncement(') >= 0);
});

test('function gateway modes match each authorization design', () => {
  const config = fs.readFileSync(
    new URL('../config.toml', import.meta.url),
    'utf8',
  );
  const section = (name) =>
    config.split(`[functions.${name}]`)[1]?.split('[functions.')[0] ?? '';

  assert.match(section('notify-truck-announcement'), /verify_jwt\s*=\s*true/);
  for (const name of [
    'notify-new-favorite',
    'notify-new-review',
    'notify-new-truck',
  ]) {
    assert.match(section(name), /verify_jwt\s*=\s*false/);
  }
});
