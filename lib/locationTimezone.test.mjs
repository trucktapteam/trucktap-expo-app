import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDestinationLocation,
  getTimezoneForCoordinates,
} from './locationTimezone.ts';

test('builds a Mountain View stop location without changing its geocoded coordinates', () => {
  const location = getDestinationLocation(37.421623, -122.084026);

  assert.deepEqual(location, {
    latitude: 37.421623,
    longitude: -122.084026,
    timezone: 'America/Los_Angeles',
  });
});

test('uses a valid timezone supplied by native reverse geocoding', () => {
  assert.equal(
    getTimezoneForCoordinates(37.422, -122.0841, 'America/Vancouver'),
    'America/Vancouver'
  );
});

test('falls back to coordinate lookup when native reverse geocoding has no timezone', () => {
  assert.equal(
    getTimezoneForCoordinates(40.7128, -74.006, null),
    'America/New_York'
  );
});

test('rejects invalid coordinates', () => {
  assert.throws(() => getTimezoneForCoordinates(Number.NaN, -122.0841));
});
