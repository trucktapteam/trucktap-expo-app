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
  getTruckDisplayLocation,
  getTruckGeneralLocationLabel,
} = await import('./truckLocation.ts');

test('general location combines home_city and home_state when both are present', () => {
  assert.equal(
    getTruckGeneralLocationLabel({ home_city: 'Louisville', home_state: 'KY' }),
    'Louisville, KY'
  );
});

test('general location falls back to whichever of city/state is present', () => {
  assert.equal(getTruckGeneralLocationLabel({ home_city: 'Louisville', home_state: null }), 'Louisville');
  assert.equal(getTruckGeneralLocationLabel({ home_city: null, home_state: 'KY' }), 'KY');
});

test('general location is omitted (null) rather than guessed from a street address when both fields are missing', () => {
  assert.equal(getTruckGeneralLocationLabel({ home_city: null, home_state: null }), null);
  assert.equal(getTruckGeneralLocationLabel({}), null);
  assert.equal(getTruckGeneralLocationLabel({ home_city: '', home_state: '   ' }), null);
});

test('general location never reads from a street address - it is not affected by a truck having a live address on file', () => {
  const truckWithFullStreetAddressButNoHomeGeography = {
    home_city: null,
    home_state: null,
    // Present to prove this field cannot leak into the general-location line.
    location: { address: '2020, Example Ridge Rd, Springfield, KY' },
  };

  assert.equal(getTruckGeneralLocationLabel(truckWithFullStreetAddressButNoHomeGeography), null);
});

test('the LIVE/event display location is unaffected by home_city/home_state and still resolves from location.address', () => {
  const truck = {
    home_city: 'Louisville',
    home_state: 'KY',
    location: { address: '2020, Example Ridge Rd, Springfield, KY' },
  };

  assert.equal(getTruckDisplayLocation(truck), '2020, Example Ridge Rd, Springfield, KY');
});

test('the LIVE/event display location still falls back through liveLocation/address when location is empty (unchanged behavior)', () => {
  assert.equal(
    getTruckDisplayLocation({ liveLocation: { address: '123 Main St' } }),
    '123 Main St'
  );
  assert.equal(getTruckDisplayLocation({}), 'Location available');
});
