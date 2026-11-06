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
  isUpcomingStopCurrentlyVisible,
  getVisibleUpcomingStopsForTruck,
  getNextUpcomingStopForTruck,
} = await import('./upcomingStopSelection.ts');

const NOW = Date.parse('2026-09-15T12:00:00Z');

const makeStop = (overrides) => ({
  truck_id: 'truck-1',
  starts_at: '2026-09-15T09:00:00Z',
  ends_at: '2026-09-15T17:00:00Z',
  status: 'scheduled',
  ...overrides,
});

test('a fully past stop (ends_at in the past) is not visible, even while status is still scheduled', () => {
  // Mirrors the El Taco Rico production row: starts_at/ends_at both 12 days
  // before "now", status never transitioned off "scheduled".
  const staleStop = makeStop({
    starts_at: '2026-09-03T12:00:00Z',
    ends_at: '2026-09-03T22:00:00Z',
    status: 'scheduled',
  });

  assert.equal(isUpcomingStopCurrentlyVisible(staleStop, NOW), false);
  assert.deepEqual(getVisibleUpcomingStopsForTruck([staleStop], 'truck-1', NOW), []);
  assert.equal(getNextUpcomingStopForTruck([staleStop], 'truck-1', NOW), null);
});

test('a stop already in progress (started in the past, not yet ended) is still visible', () => {
  const inProgressStop = makeStop({
    starts_at: '2026-09-15T09:00:00Z', // started 3 hours ago
    ends_at: '2026-09-15T17:00:00Z', // ends in 5 hours
    status: 'scheduled',
  });

  assert.equal(isUpcomingStopCurrentlyVisible(inProgressStop, NOW), true);
  assert.deepEqual(getVisibleUpcomingStopsForTruck([inProgressStop], 'truck-1', NOW), [inProgressStop]);
});

test('a future stop is visible', () => {
  const futureStop = makeStop({
    starts_at: '2026-09-20T09:00:00Z',
    ends_at: '2026-09-20T17:00:00Z',
  });

  assert.equal(isUpcomingStopCurrentlyVisible(futureStop, NOW), true);
});

for (const status of ['cancelled', 'completed']) {
  test(`a stop with status "${status}" is never visible, even with a future window`, () => {
    const stop = makeStop({
      starts_at: '2026-09-20T09:00:00Z',
      ends_at: '2026-09-20T17:00:00Z',
      status,
    });

    assert.equal(isUpcomingStopCurrentlyVisible(stop, NOW), false);
  });
}

for (const status of ['delayed', 'sold_out']) {
  test(`a stop with status "${status}" stays visible while its window hasn't ended`, () => {
    const stop = makeStop({
      starts_at: '2026-09-15T09:00:00Z',
      ends_at: '2026-09-15T17:00:00Z',
      status,
    });

    assert.equal(isUpcomingStopCurrentlyVisible(stop, NOW), true);
  });
}

test('an in-progress stop is preferred over a later future stop (soonest-start-first ordering)', () => {
  const inProgress = makeStop({
    starts_at: '2026-09-15T09:00:00Z',
    ends_at: '2026-09-15T17:00:00Z',
  });
  const laterFuture = makeStop({
    starts_at: '2026-09-20T09:00:00Z',
    ends_at: '2026-09-20T17:00:00Z',
  });

  // Deliberately inserted out of chronological order to prove sorting, not
  // insertion order, decides the result.
  const stops = [laterFuture, inProgress];

  assert.equal(getNextUpcomingStopForTruck(stops, 'truck-1', NOW), inProgress);
  assert.deepEqual(getVisibleUpcomingStopsForTruck(stops, 'truck-1', NOW), [inProgress, laterFuture]);
});

test('stops for other trucks are excluded', () => {
  const otherTruckStop = makeStop({ truck_id: 'truck-2' });

  assert.equal(getNextUpcomingStopForTruck([otherTruckStop], 'truck-1', NOW), null);
});

test('a malformed ends_at is treated as not visible rather than visible forever', () => {
  const malformed = makeStop({ ends_at: 'not-a-date' });

  assert.equal(isUpcomingStopCurrentlyVisible(malformed, NOW), false);
});

test('the 2029 typo stop (bad source data, out of scope for this fix) still surfaces as the next stop when it is the only future row', () => {
  // Confirms this fix does not silently "correct" bad source data (e.g. a
  // truck owner mistyping the year) - that stop is still genuinely in the
  // future, so it is legitimately selected. Fixing the underlying data is a
  // separate, non-code follow-up.
  const typoStop = makeStop({
    starts_at: '2029-08-28T15:00:00Z',
    ends_at: '2029-08-28T18:00:00Z',
  });

  assert.equal(getNextUpcomingStopForTruck([typoStop], 'truck-1', NOW), typoStop);
});
