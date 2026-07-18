import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findPersistedRequestedLiveLocation,
  rpcSupportsCanonicalLiveLocation,
} from './liveLocationCompatibility.ts';

const truckId = '10000000-0000-0000-0000-000000000001';
const requested = {
  latitude: 38.2527,
  longitude: -85.7585,
  label: '  Main Street Test Stop  ',
};

const runCompatibilityFlow = async ({ rpcWritesLocation, startsAtRequestedLocation = false }) => {
  let persisted = {
    truck_id: truckId,
    latitude: startsAtRequestedLocation ? requested.latitude : 38,
    longitude: startsAtRequestedLocation ? requested.longitude : -85,
    label: startsAtRequestedLocation ? requested.label.trim() : 'Previous Stop',
  };
  let rpcLocationWrites = 0;
  let legacyLocationWrites = 0;
  const rpcRow = rpcWritesLocation
    ? { id: truckId, live_stop_id: null }
    : { id: truckId };

  if (rpcWritesLocation) {
    rpcLocationWrites += 1;
    persisted = {
      truck_id: truckId,
      latitude: requested.latitude,
      longitude: requested.longitude,
      label: requested.label.trim(),
    };
  }

  let matchingRow = findPersistedRequestedLiveLocation([persisted], truckId, requested);
  const rpcUsesCanonicalLocation = rpcSupportsCanonicalLiveLocation(rpcRow);
  const rpcPersistedRequestedLocation =
    rpcUsesCanonicalLocation && Boolean(matchingRow);

  if (!rpcUsesCanonicalLocation) {
    legacyLocationWrites += 1;
    persisted = {
      truck_id: truckId,
      latitude: requested.latitude,
      longitude: requested.longitude,
      label: requested.label.trim(),
    };
    matchingRow = findPersistedRequestedLiveLocation([persisted], truckId, requested);
  } else if (!rpcPersistedRequestedLocation) {
    throw new Error('Phase 1A location could not be verified');
  }

  return {
    matchingRow,
    rpcLocationWrites,
    legacyLocationWrites,
    totalLocationWrites: rpcLocationWrites + legacyLocationWrites,
  };
};

test('current production contract performs one legacy location write', async () => {
  const result = await runCompatibilityFlow({ rpcWritesLocation: false });

  assert.ok(result.matchingRow);
  assert.equal(result.rpcLocationWrites, 0);
  assert.equal(result.legacyLocationWrites, 1);
  assert.equal(result.totalLocationWrites, 1);
});

test('Phase 1A contract skips the legacy write after the canonical RPC write', async () => {
  const result = await runCompatibilityFlow({ rpcWritesLocation: true });

  assert.ok(result.matchingRow);
  assert.equal(result.rpcLocationWrites, 1);
  assert.equal(result.legacyLocationWrites, 0);
  assert.equal(result.totalLocationWrites, 1);
});

test('current production still refreshes a previously matching location once', async () => {
  const result = await runCompatibilityFlow({
    rpcWritesLocation: false,
    startsAtRequestedLocation: true,
  });

  assert.ok(result.matchingRow);
  assert.equal(result.rpcLocationWrites, 0);
  assert.equal(result.legacyLocationWrites, 1);
  assert.equal(result.totalLocationWrites, 1);
});

test('RPC capability is only present in the Phase 1A truck response', () => {
  assert.equal(rpcSupportsCanonicalLiveLocation({ id: truckId }), false);
  assert.equal(rpcSupportsCanonicalLiveLocation({
    id: truckId,
    live_stop_id: null,
  }), true);
});

test('matching requires coordinates and the normalized requested label', () => {
  assert.equal(findPersistedRequestedLiveLocation([{
    truck_id: truckId,
    latitude: requested.latitude,
    longitude: requested.longitude,
    label: 'Another Stop',
  }], truckId, requested), null);

  assert.ok(findPersistedRequestedLiveLocation([{
    truck_id: truckId,
    latitude: requested.latitude,
    longitude: requested.longitude,
    label: requested.label.trim(),
  }], truckId, requested));
});

test('null coordinates never match a legitimate zero coordinate', () => {
  assert.equal(findPersistedRequestedLiveLocation([{
    truck_id: truckId,
    latitude: null,
    longitude: null,
    label: 'Equator',
  }], truckId, {
    latitude: 0,
    longitude: 0,
    label: 'Equator',
  }), null);
});
