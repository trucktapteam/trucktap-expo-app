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
