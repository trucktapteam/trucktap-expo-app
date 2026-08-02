import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getActiveTruckFromCandidates,
  getActiveTruckStorageKey,
  getArchivedPartnerTrucks,
  getEligiblePartnerTrucks,
  getRecordsForTruck,
  getTruckScopedStorageKey,
  resolveAdminTruck,
  resolveOwnerActiveTruck,
  resolvePartnerActiveTruck,
  shouldShowPartnerTruckSelector,
} from './activeTruck.ts';

const ownerId = 'owner-1';
const truck = (id, overrides = {}) => ({
  id,
  owner_id: ownerId,
  created_at: `2026-08-0${id === 'truck-a' ? '1' : '2'}T12:00:00.000Z`,
  ...overrides,
});

test('one eligible owned truck does not show the selector', () => {
  assert.equal(shouldShowPartnerTruckSelector(getEligiblePartnerTrucks([truck('truck-a')], ownerId)), false);
});

test('multiple eligible owned trucks show the selector', () => {
  assert.equal(shouldShowPartnerTruckSelector(getEligiblePartnerTrucks([truck('truck-a'), truck('truck-b')], ownerId)), true);
});

test('a selected truck ID changes the shared active candidate', () => {
  const trucks = [truck('truck-a'), truck('truck-b')];
  const resolution = resolvePartnerActiveTruck({ trucks, userId: ownerId, persistedTruckId: 'truck-b' });
  assert.equal(resolution.activeTruckId, 'truck-b');
  assert.equal(getActiveTruckFromCandidates(trucks, resolution.activeTruckId)?.id, 'truck-b');
});

test('selection persistence is isolated per user and restores on restart', () => {
  assert.equal(getActiveTruckStorageKey(ownerId), 'activeTruckId:owner-1');
  assert.deepEqual(resolvePartnerActiveTruck({
    trucks: [truck('truck-a'), truck('truck-b')],
    userId: ownerId,
    persistedTruckId: 'truck-b',
    legacyProfileTruckId: 'truck-a',
  }), { activeTruckId: 'truck-b', source: 'persisted' });
});

test('invalid persisted IDs fall back deterministically and exclude unsafe trucks', () => {
  assert.deepEqual(resolvePartnerActiveTruck({
    trucks: [
      truck('truck-b'),
      truck('truck-a'),
      truck('archived', { archived: true }),
      truck('test', { is_test: true }),
      truck('unauthorized', { owner_id: 'owner-2' }),
    ],
    userId: ownerId,
    persistedTruckId: 'unauthorized',
  }), { activeTruckId: 'truck-a', source: 'fallback' });
});

test('a newly created second truck is immediately eligible and can become active', () => {
  const refreshed = [truck('truck-a'), truck('truck-b')];
  assert.deepEqual(getEligiblePartnerTrucks(refreshed, ownerId).map(item => item.id), ['truck-a', 'truck-b']);
  assert.equal(resolvePartnerActiveTruck({ trucks: refreshed, userId: ownerId, persistedTruckId: 'truck-b' }).activeTruckId, 'truck-b');
});

test('truck-scoped data selectors and storage keys use only the active truck ID', () => {
  const records = [
    { id: 'a-1', truck_id: 'truck-a' },
    { id: 'b-1', truck_id: 'truck-b' },
    { id: 'b-2', truck_id: 'truck-b' },
  ];
  assert.deepEqual(getRecordsForTruck(records, 'truck-b', record => record.truck_id).map(record => record.id), ['b-1', 'b-2']);
  assert.equal(getTruckScopedStorageKey('upcomingStopRecentLocations', ownerId, 'truck-b'), 'upcomingStopRecentLocations:owner-1:truck-b');
});

test('admin selection still permits globally selected archived, test, or unowned trucks', () => {
  const globallySelected = truck('admin-target', { owner_id: 'owner-2', archived: true, is_test: true });
  assert.equal(resolveAdminTruck({
    ownedTrucks: [truck('truck-a')],
    allTrucks: [globallySelected],
    selectedAdminTruckId: globallySelected.id,
  })?.id, globallySelected.id);
});

test('an owner whose only truck is archived falls back to that truck instead of null', () => {
  const ownedTrucks = [truck('truck-a', { archived: true })];
  const eligibleOwnedTrucks = getEligiblePartnerTrucks(ownedTrucks, ownerId);
  assert.deepEqual(eligibleOwnedTrucks, []);

  const resolved = resolveOwnerActiveTruck({
    ownedTrucks,
    eligibleOwnedTrucks,
    activeTruckId: null,
  });
  assert.equal(resolved?.id, 'truck-a');
});

test('an owner with an eligible truck resolves to the active eligible truck, not the archived fallback', () => {
  const ownedTrucks = [truck('truck-archived', { archived: true }), truck('truck-b')];
  const eligibleOwnedTrucks = getEligiblePartnerTrucks(ownedTrucks, ownerId);
  assert.deepEqual(eligibleOwnedTrucks.map(item => item.id), ['truck-b']);

  const resolved = resolveOwnerActiveTruck({
    ownedTrucks,
    eligibleOwnedTrucks,
    activeTruckId: 'truck-b',
  });
  assert.equal(resolved?.id, 'truck-b');
});

test('creating a second truck makes it active while the first remains selectable', () => {
  // Mirrors app/truck-setup.tsx's post-creation sequence: refreshOwnedTrucks()
  // brings back both trucks, then switchActiveTruck(newId) persists the new
  // truck's ID.
  const ownedTrucksAfterRefresh = [truck('truck-a'), truck('truck-b')];
  const eligibleOwnedTrucks = getEligiblePartnerTrucks(ownedTrucksAfterRefresh, ownerId);
  assert.deepEqual(eligibleOwnedTrucks.map(item => item.id), ['truck-a', 'truck-b']);
  assert.equal(shouldShowPartnerTruckSelector(eligibleOwnedTrucks), true);

  const resolution = resolvePartnerActiveTruck({
    trucks: eligibleOwnedTrucks,
    userId: ownerId,
    persistedTruckId: 'truck-b',
  });
  assert.equal(resolution.activeTruckId, 'truck-b');

  const activeTruck = resolveOwnerActiveTruck({
    ownedTrucks: ownedTrucksAfterRefresh,
    eligibleOwnedTrucks,
    activeTruckId: resolution.activeTruckId,
  });
  assert.equal(activeTruck?.id, 'truck-b');

  // The original truck must still be reachable through the switcher.
  assert.ok(eligibleOwnedTrucks.some(item => item.id === 'truck-a'));
  assert.equal(getActiveTruckFromCandidates(eligibleOwnedTrucks, 'truck-a')?.id, 'truck-a');
});

test('archived row hidden with zero archived trucks', () => {
  const ownedTrucks = [truck('truck-a'), truck('truck-b')];
  assert.deepEqual(getArchivedPartnerTrucks(ownedTrucks, ownerId), []);
});

test('archived row shown with one or more owned archived trucks', () => {
  const ownedTrucks = [truck('truck-a'), truck('truck-archived', { archived: true })];
  assert.deepEqual(
    getArchivedPartnerTrucks(ownedTrucks, ownerId).map(item => item.id),
    ['truck-archived']
  );
});

test('restoring an archived truck makes it eligible again and drops it from the archived list', () => {
  const archived = truck('truck-a', { archived: true, archivedAt: '2026-07-01T00:00:00.000Z' });
  const ownedTrucksBeforeRestore = [archived];
  assert.deepEqual(getEligiblePartnerTrucks(ownedTrucksBeforeRestore, ownerId), []);
  assert.deepEqual(getArchivedPartnerTrucks(ownedTrucksBeforeRestore, ownerId).map(item => item.id), ['truck-a']);

  // Mirrors what updateTruckDetails({ archived: false, archivedAt: undefined, ... })
  // does to the row, followed by refreshOwnedTrucks() picking up the change.
  const restored = { ...archived, archived: false, archivedAt: undefined };
  const ownedTrucksAfterRestore = [restored];

  assert.deepEqual(
    getEligiblePartnerTrucks(ownedTrucksAfterRestore, ownerId).map(item => item.id),
    ['truck-a']
  );
  assert.deepEqual(getArchivedPartnerTrucks(ownedTrucksAfterRestore, ownerId), []);
});

test('unauthorized and test trucks are excluded from the archived list', () => {
  const ownedTrucks = [
    truck('truck-mine-archived', { archived: true }),
    truck('truck-other-owner-archived', { archived: true, owner_id: 'owner-2' }),
    truck('truck-test-archived', { archived: true, is_test: true }),
  ];
  assert.deepEqual(
    getArchivedPartnerTrucks(ownedTrucks, ownerId).map(item => item.id),
    ['truck-mine-archived']
  );
});

test('the active switcher still excludes archived trucks even when archived trucks exist', () => {
  const ownedTrucks = [truck('truck-a'), truck('truck-b'), truck('truck-archived', { archived: true })];
  const eligibleOwnedTrucks = getEligiblePartnerTrucks(ownedTrucks, ownerId);
  assert.deepEqual(eligibleOwnedTrucks.map(item => item.id), ['truck-a', 'truck-b']);
  assert.equal(shouldShowPartnerTruckSelector(eligibleOwnedTrucks), true);
  assert.equal(getActiveTruckFromCandidates(eligibleOwnedTrucks, 'truck-archived'), null);
});

