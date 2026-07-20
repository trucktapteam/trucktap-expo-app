import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./releasePolicyCore.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace(/require\("@\/lib\/clientRelease"\);/, '');
const module = { exports: {} };
new Function('module', 'exports', 'require', transpiled)(
  module,
  module.exports,
  () => ({}),
);

const {
  evaluateOwnerAccess,
  getOwnerRestrictionFromError,
  getPolicyStoreUrl,
  mapOwnerReleasePolicy,
  evaluateClientAccess,
  mapCompatibilityPolicy,
  parseClientRestrictionFromError,
  KNOWN_CLIENT_SCOPES,
} = module.exports;

const policy = {
  ownerGateEnabled: true,
  ownerManagementPaused: false,
  minimumAndroidBuild: 50,
  minimumIosBuild: 20,
  androidStoreUrl: 'https://play.google.com/store/apps/details?id=trucktap',
  iosStoreUrl: 'https://apps.apple.com/us/app/trucktap/id123',
  updateTitle: 'Update',
  updateMessage: 'Update now',
  updatedAt: null,
};

test('evaluates independent native build minimums', () => {
  assert.equal(evaluateOwnerAccess(policy, 'android', 49), 'update_required');
  assert.equal(evaluateOwnerAccess(policy, 'android', 50), 'allowed');
  assert.equal(evaluateOwnerAccess(policy, 'ios', 19), 'update_required');
  assert.equal(evaluateOwnerAccess(policy, 'ios', 20), 'allowed');
  assert.equal(evaluateOwnerAccess(policy, 'web', null), 'allowed');
});

test('pause takes precedence and disabled enforcement allows missing builds', () => {
  assert.equal(
    evaluateOwnerAccess({ ...policy, ownerManagementPaused: true }, 'android', 99),
    'paused',
  );
  assert.equal(
    evaluateOwnerAccess({ ...policy, ownerGateEnabled: false }, 'android', null),
    'allowed',
  );
});

test('maps safe defaults and direct platform store URLs', () => {
  const mapped = mapOwnerReleasePolicy(null);
  assert.equal(mapped.ownerGateEnabled, false);
  assert.equal(mapped.ownerManagementPaused, false);
  assert.equal(getPolicyStoreUrl(policy, 'android'), policy.androidStoreUrl);
  assert.equal(getPolicyStoreUrl(policy, 'ios'), policy.iosStoreUrl);
  assert.equal(getPolicyStoreUrl(policy, 'web'), null);
});

test('recognizes structured server restrictions', () => {
  assert.equal(
    getOwnerRestrictionFromError({ details: 'owner_update_required' }),
    'update_required',
  );
  assert.equal(
    getOwnerRestrictionFromError({ message: 'TRUCKTAP_OWNER_MANAGEMENT_PAUSED' }),
    'paused',
  );
  assert.equal(getOwnerRestrictionFromError({ message: 'Other error' }), null);
});

test('generalized evaluateClientAccess matches evaluateOwnerAccess for the same inputs', () => {
  const generalized = {
    enabled: true,
    paused: false,
    minimumAndroidBuild: 50,
    minimumIosBuild: 20,
  };
  assert.equal(evaluateClientAccess(generalized, 'android', 49), 'update_required');
  assert.equal(evaluateClientAccess(generalized, 'android', 50), 'allowed');
  assert.equal(evaluateClientAccess(generalized, 'ios', 19), 'update_required');
  assert.equal(evaluateClientAccess({ ...generalized, paused: true }, 'android', 99), 'paused');
  assert.equal(evaluateClientAccess({ ...generalized, enabled: false }, 'android', null), 'allowed');
  assert.equal(evaluateClientAccess(generalized, 'web', null), 'allowed');
});

test('mapCompatibilityPolicy applies safe defaults for any scope', () => {
  const mapped = mapCompatibilityPolicy('private_data', null);
  assert.equal(mapped.scope, 'private_data');
  assert.equal(mapped.enabled, false);
  assert.equal(mapped.paused, false);
  assert.equal(mapped.minimumAndroidBuild, null);

  const enabled = mapCompatibilityPolicy('private_data', {
    enabled: true,
    paused: false,
    minimum_android_build: 12,
    minimum_ios_build: 7,
    android_store_url: 'https://play.google.com/store/apps/details?id=x',
    ios_store_url: 'https://apps.apple.com/us/app/x/id1',
    update_title: 'Update',
    update_message: 'Please update',
    updated_at: '2026-07-20T00:00:00Z',
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.minimumAndroidBuild, 12);
});

test('parseClientRestrictionFromError recognizes the new private_data scope without touching owner_management matching', () => {
  assert.deepEqual(
    parseClientRestrictionFromError({ details: 'private_data_update_required' }),
    { scope: 'private_data', restriction: 'update_required' },
  );
  assert.deepEqual(
    parseClientRestrictionFromError({ message: 'TRUCKTAP_PRIVATE_DATA_PAUSED' }),
    { scope: 'private_data', restriction: 'paused' },
  );
  assert.deepEqual(
    parseClientRestrictionFromError({ details: 'owner_update_required' }),
    { scope: 'owner_management', restriction: 'update_required' },
  );
  assert.equal(parseClientRestrictionFromError({ message: 'Other error' }), null);
  assert.ok(KNOWN_CLIENT_SCOPES.includes('owner_management'));
  assert.ok(KNOWN_CLIENT_SCOPES.includes('private_data'));
});
