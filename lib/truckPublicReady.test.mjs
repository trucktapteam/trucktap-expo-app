import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  getPublicReadyStatus,
  isLegacyTruckBioEnforcementActive,
  isTruckPublicReady,
} = await import('./truckPublicReady.ts');
const {
  canViewIncompleteTruckProfile,
  getTruckAdminStatus,
} = await import('./truckProfileCompleteness.ts');
const { getTruckVisibilitySetupStatus } = await import('./truckVisibilitySetup.ts');
const { PUBLIC_READY_ENFORCEMENT_POLICY } = await import('../constants/publicReady.ts');

const NEW_TRUCK_BIO_REQUIRED_AT =
  PUBLIC_READY_ENFORCEMENT_POLICY.newTruckBioRequiredAt;
const LEGACY_ENFORCEMENT_AT = '2026-08-15T00:00:00Z';

const disabledPolicy = {
  newTruckBioRequiredAt: NEW_TRUCK_BIO_REQUIRED_AT,
  legacyTruckBioEnforcementAt: null,
};

const scheduledPolicy = {
  newTruckBioRequiredAt: NEW_TRUCK_BIO_REQUIRED_AT,
  legacyTruckBioEnforcementAt: LEGACY_ENFORCEMENT_AT,
};

const legacyTruck = {
  id: 'legacy-truck',
  owner_id: 'legacy-owner',
  name: 'Legacy Truck',
  logo: 'https://example.invalid/legacy-logo.png',
  hero_image: 'https://example.invalid/legacy-hero.png',
  bio: '',
  service_area: 'Louisville',
  created_at: '2026-07-18T23:59:59Z',
};

const newTruck = {
  ...legacyTruck,
  id: 'new-truck',
  owner_id: 'new-owner',
  name: 'New Truck',
  created_at: NEW_TRUCK_BIO_REQUIRED_AT,
};

test('default and explicitly disabled enforcement keep a legacy truck visible', () => {
  assert.equal(isLegacyTruckBioEnforcementActive(), false);
  assert.equal(isTruckPublicReady(legacyTruck), true);

  const status = getPublicReadyStatus(legacyTruck, {
    now: '2030-01-01T00:00:00Z',
    policy: disabledPolicy,
  });
  const setup = getTruckVisibilitySetupStatus(legacyTruck, {
    now: '2030-01-01T00:00:00Z',
    policy: disabledPolicy,
  });

  assert.equal(status.complete, true);
  assert.equal(status.isLegacy, true);
  assert.equal(status.bioRequired, false);
  assert.deepEqual(status.missing, []);
  assert.equal(canViewIncompleteTruckProfile(
    legacyTruck,
    null,
    { now: '2030-01-01T00:00:00Z', policy: disabledPolicy },
  ), true);
  assert.deepEqual(setup.missing, []);
  assert.deepEqual(setup.recommended, ['bio']);
});

test('before scheduled enforcement, legacy visibility and coaching remain grandfathered', () => {
  const options = {
    now: '2026-08-14T23:59:59.999Z',
    policy: scheduledPolicy,
  };

  assert.equal(isLegacyTruckBioEnforcementActive(options), false);
  assert.equal(isTruckPublicReady(legacyTruck, options), true);
  assert.equal(canViewIncompleteTruckProfile(legacyTruck, null, options), true);
  assert.deepEqual(
    getTruckVisibilitySetupStatus(legacyTruck, options).recommended,
    ['bio'],
  );
});

test('at and after enforcement, legacy bio becomes required for customers', () => {
  for (const now of [
    LEGACY_ENFORCEMENT_AT,
    '2026-08-15T00:00:00.001Z',
  ]) {
    const options = { now, policy: scheduledPolicy };
    const status = getPublicReadyStatus(legacyTruck, options);
    const setup = getTruckVisibilitySetupStatus(legacyTruck, options);

    assert.equal(isLegacyTruckBioEnforcementActive(options), true);
    assert.equal(status.complete, false);
    assert.equal(status.isLegacy, true);
    assert.equal(status.bioRequired, true);
    assert.deepEqual(status.missing, ['bio']);
    assert.equal(canViewIncompleteTruckProfile(legacyTruck, null, options), false);
    assert.equal(canViewIncompleteTruckProfile(
      legacyTruck,
      { id: 'legacy-owner', role: 'truck', truck_id: 'legacy-truck' },
      options,
    ), true);
    assert.equal(canViewIncompleteTruckProfile(
      legacyTruck,
      { id: 'admin', role: 'admin', truck_id: undefined },
      options,
    ), true);
    assert.deepEqual(setup.missing, ['bio']);
    assert.deepEqual(setup.recommended, []);
  }
});

test('new trucks require bio even while legacy enforcement is disabled', () => {
  const options = {
    now: NEW_TRUCK_BIO_REQUIRED_AT,
    policy: disabledPolicy,
  };
  const status = getPublicReadyStatus(newTruck, options);

  assert.equal(isTruckPublicReady(newTruck), false);
  assert.equal(status.isLegacy, false);
  assert.equal(status.bioRequired, true);
  assert.deepEqual(status.missing, ['bio']);
  assert.equal(canViewIncompleteTruckProfile(newTruck, null, options), false);
  assert.equal(canViewIncompleteTruckProfile(
    newTruck,
    { id: 'new-owner', role: 'truck', truck_id: 'new-truck' },
    options,
  ), true);
});

test('disabled enforcement does not change the existing name, logo, or hero requirements', () => {
  const incompleteLegacyTruck = {
    ...legacyTruck,
    name: '',
  };
  const options = {
    now: '2030-01-01T00:00:00Z',
    policy: disabledPolicy,
  };

  assert.deepEqual(
    getPublicReadyStatus(incompleteLegacyTruck, options).missing,
    ['name'],
  );
  assert.equal(
    canViewIncompleteTruckProfile(incompleteLegacyTruck, null, options),
    false,
  );
});

test('broader admin profile status remains separate from bio visibility enforcement', () => {
  assert.equal(getTruckAdminStatus(legacyTruck, false), 'Active');
});
