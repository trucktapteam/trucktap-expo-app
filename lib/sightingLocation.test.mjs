import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./sightingLocation.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', 'process', transpiled)(
  module,
  module.exports,
  { env: {} }
);

const { getSightingLocationText, mapReverseGeocodeResult } = module.exports;
const base = {
  id: 'sighting-1',
  truck_name: 'Test Truck',
  latitude: 37.123456,
  longitude: -85.987654,
  created_at: '2026-07-18T12:00:00Z',
  expires_at: '2026-07-19T12:00:00Z',
};

test('uses the required friendly-location priority', () => {
  assert.equal(
    getSightingLocationText({
      ...base,
      business_name: 'Courthouse Farmers Market',
      street_address: '100 Main St',
      city: 'Elizabethtown',
      state: 'KY',
    }),
    'Courthouse Farmers Market'
  );
  assert.equal(
    getSightingLocationText({
      ...base,
      street_address: '100 Main St',
      city: 'Elizabethtown',
      state: 'KY',
    }),
    '100 Main St'
  );
  assert.equal(
    getSightingLocationText({ ...base, city: 'Elizabethtown', state: 'KY' }),
    'Elizabethtown, KY'
  );
  assert.equal(
    getSightingLocationText(base),
    '37.12346, -85.98765'
  );
});

test('maps reverse-geocode data without changing stored coordinates', () => {
  const resolved = mapReverseGeocodeResult({
    status: 'OK',
    results: [{
      formatted_address: '100 Main St, Elizabethtown, KY 42701, USA',
      types: ['street_address'],
      address_components: [
        { long_name: '100', types: ['street_number'] },
        { long_name: 'Main Street', types: ['route'] },
        { long_name: 'Elizabethtown', types: ['locality'] },
        {
          long_name: 'Kentucky',
          short_name: 'KY',
          types: ['administrative_area_level_1'],
        },
      ],
    }],
  });

  assert.deepEqual(resolved, {
    resolved_location_name: null,
    resolved_street_address: '100 Main Street',
    resolved_city: 'Elizabethtown',
    resolved_state: 'KY',
  });
  assert.equal('latitude' in resolved, false);
  assert.equal('longitude' in resolved, false);
});

test('prefers a reverse-geocoded business or location name', () => {
  const resolved = mapReverseGeocodeResult({
    status: 'OK',
    results: [
      {
        formatted_address: 'Downtown Farmers Market, 100 Main St, Elizabethtown, KY',
        types: ['establishment', 'point_of_interest'],
        address_components: [
          { long_name: '100', types: ['street_number'] },
          { long_name: 'Main Street', types: ['route'] },
          { long_name: 'Elizabethtown', types: ['locality'] },
          {
            long_name: 'Kentucky',
            short_name: 'KY',
            types: ['administrative_area_level_1'],
          },
        ],
      },
    ],
  });

  assert.equal(resolved.resolved_location_name, 'Downtown Farmers Market');
  assert.equal(
    getSightingLocationText({ ...base, ...resolved }),
    'Downtown Farmers Market'
  );
});
