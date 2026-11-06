import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  deriveCityStateFromServiceArea,
  getTruckBasedNearText,
  getTruckCardLocation,
  getTruckDisplayLocation,
  getTruckGeneralLocationLabel,
  getTruckNavigationState,
  getTruckSearchFields,
  isRegionDescription,
} = await import('./truckLocation.ts');

// Every address in this file is fictional.
const FICTIONAL_STREET = '742, Evergreen Ter, Springfield, Kentucky';
const FICTIONAL_LIVE_SPOT = '100 Market St, Springfield, KY 40001';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// --- General location: home_city/home_state first ---------------------------

test('general location combines home_city and home_state when both are present', () => {
  assert.equal(
    getTruckGeneralLocationLabel({ home_city: 'Springfield', home_state: 'KY' }),
    'Springfield, KY'
  );
});

test('general location falls back to whichever of city/state is present', () => {
  assert.equal(getTruckGeneralLocationLabel({ home_city: 'Springfield', home_state: null }), 'Springfield');
  assert.equal(getTruckGeneralLocationLabel({ home_city: null, home_state: 'KY' }), 'KY');
});

test('home_city/home_state win over service_area', () => {
  assert.equal(
    getTruckGeneralLocationLabel({ home_city: 'Shelbyville', home_state: 'KY', service_area: FICTIONAL_STREET }),
    'Shelbyville, KY'
  );
});

// --- service_area fallback: city/state only, never a street ------------------

test('full street address in service_area reduces to city and state only', () => {
  assert.equal(deriveCityStateFromServiceArea(FICTIONAL_STREET), 'Springfield, KY');
  assert.equal(deriveCityStateFromServiceArea('12 Oak Lane, Riverton, OH 45001'), 'Riverton, OH');
  assert.equal(deriveCityStateFromServiceArea('3301-3305, Mill Rd, Fairview, TN'), 'Fairview, TN');

  const label = getTruckGeneralLocationLabel({ home_city: null, home_state: null, service_area: FICTIONAL_STREET });
  assert.equal(label, 'Springfield, KY');
  assert.ok(!/\d/.test(label));
  assert.ok(!/Evergreen/.test(label));
});

test('city/state-only service_area values are kept as city and state', () => {
  assert.equal(deriveCityStateFromServiceArea('Springfield, KY'), 'Springfield, KY');
  assert.equal(deriveCityStateFromServiceArea('Springfield, Kentucky'), 'Springfield, KY');
  assert.equal(deriveCityStateFromServiceArea('Springfield KY'), 'Springfield, KY');
  assert.equal(deriveCityStateFromServiceArea('Cedar Falls New York'), 'Cedar Falls, NY');
});

test('missing home geography and missing service_area show nothing', () => {
  assert.equal(getTruckGeneralLocationLabel({ home_city: null, home_state: null }), null);
  assert.equal(getTruckGeneralLocationLabel({}), null);
  assert.equal(getTruckGeneralLocationLabel({ home_city: '', home_state: '   ', service_area: '  ' }), null);
  assert.equal(getTruckBasedNearText({}), null);
});

test('malformed or ambiguous service_area values fail closed instead of guessing', () => {
  for (const value of [
    '742 Evergreen Terrace',                // street, no city/state
    '742, Evergreen Ter, Springfield',      // no recognizable state
    'Evergreen Ter, KY',                    // "city" is a street
    '123 Main St KY',                       // street before state, no commas
    'Hardin County / Central KY',           // region text, not a city
    'Serving the whole tri-state area!',
    ', , ,',
    '40001',
  ]) {
    assert.equal(deriveCityStateFromServiceArea(value), null, value);
  }
});

test('general location never reads the LIVE/last-serving location', () => {
  const truck = {
    home_city: null,
    home_state: null,
    service_area: null,
    location: { address: FICTIONAL_LIVE_SPOT },
  };
  assert.equal(getTruckGeneralLocationLabel(truck), null);
});

test('one consistent wording is used for the general location line', () => {
  assert.equal(getTruckBasedNearText({ home_city: 'Springfield', home_state: 'KY' }), 'Based near Springfield, KY');
  assert.equal(getTruckBasedNearText({ service_area: FICTIONAL_STREET }), 'Based near Springfield, KY');
});

// --- LIVE vs offline vs upcoming stop on cards --------------------------------

test('LIVE truck card shows its actual serving location', () => {
  const card = getTruckCardLocation({ location: { address: FICTIONAL_LIVE_SPOT } }, { openNow: true, nextStop: null });
  assert.deepEqual(card, { kind: 'live', text: FICTIONAL_LIVE_SPOT });
});

test('LIVE location wins over an upcoming stop', () => {
  const card = getTruckCardLocation(
    { location: { address: FICTIONAL_LIVE_SPOT } },
    { openNow: true, nextStop: { starts_at: '2026-11-08T16:00:00Z', location_text: 'County Fairgrounds' } }
  );
  assert.equal(card.kind, 'live');
});

test('offline truck never shows its old serving address', () => {
  const card = getTruckCardLocation({ location: { address: FICTIONAL_LIVE_SPOT } }, { openNow: false, nextStop: null });
  assert.deepEqual(card, { kind: 'none' });
});

test('offline truck with a future stop shows that stop, not the old serving address', () => {
  const card = getTruckCardLocation(
    { location: { address: FICTIONAL_LIVE_SPOT } },
    { openNow: false, nextStop: { starts_at: '2026-11-08T16:00:00Z', location_text: '  County Fairgrounds  ' } }
  );
  assert.deepEqual(card, { kind: 'upcoming', startsAt: '2026-11-08T16:00:00Z', locationText: 'County Fairgrounds' });

  const noText = getTruckCardLocation({}, { openNow: false, nextStop: { starts_at: '2026-11-08T16:00:00Z', location_text: '' } });
  assert.equal(noText.kind, 'upcoming');
  assert.equal(noText.locationText, null);
});

test('upcoming stop on the Discover card is labeled as the next stop', () => {
  const discover = readSource('app/(customer)/(tabs)/discover.tsx');
  assert.match(discover, /📅 Next stop: \{formatCardStopDateTime\(nextStop\.starts_at\)\}/);
});

test('the LIVE display location still resolves from location.address', () => {
  assert.equal(getTruckDisplayLocation({ location: { address: FICTIONAL_LIVE_SPOT } }), FICTIONAL_LIVE_SPOT);
  assert.equal(getTruckDisplayLocation({ liveLocation: { address: '100 Market St' } }), '100 Market St');
  assert.equal(getTruckDisplayLocation({}), 'Location available');
});

// --- Navigation -------------------------------------------------------------------

test('customers can navigate only to a truck that is LIVE now', () => {
  assert.equal(getTruckNavigationState({ isCustomerView: true, openNow: true, hasCoordinates: true }), 'navigate');
  assert.equal(getTruckNavigationState({ isCustomerView: true, openNow: false, hasCoordinates: true }), 'not_serving');
  assert.equal(getTruckNavigationState({ isCustomerView: true, openNow: true, hasCoordinates: false }), 'unavailable');
  assert.equal(getTruckNavigationState({ isCustomerView: false, openNow: false, hasCoordinates: true }), 'navigate');
});

// --- Search -------------------------------------------------------------------------

test('offline trucks are not searchable by street text', () => {
  const truck = {
    name: 'Example Tacos',
    service_area: FICTIONAL_STREET,
    location: { address: FICTIONAL_LIVE_SPOT },
  };
  const fields = getTruckSearchFields(truck, { openNow: false }).join(' | ').toLowerCase();
  assert.ok(!fields.includes('evergreen'));
  assert.ok(!fields.includes('market st'));
  assert.ok(fields.includes('springfield, ky'));
  assert.ok(fields.includes('example tacos'));
});

test('LIVE trucks stay searchable by their current serving address', () => {
  const fields = getTruckSearchFields({ name: 'Example Tacos', location: { address: FICTIONAL_LIVE_SPOT } }, { openNow: true });
  assert.ok(fields.includes(FICTIONAL_LIVE_SPOT));
});

test('region descriptions stay searchable but street-like text does not', () => {
  assert.equal(isRegionDescription('Hardin County / Central KY'), true);
  assert.equal(isRegionDescription(FICTIONAL_STREET), false);
  assert.equal(isRegionDescription('Evergreen Ter, Springfield, KY'), false);
  assert.ok(getTruckSearchFields({ service_area: 'Hardin County / Central KY' }, { openNow: false })
    .includes('Hardin County / Central KY'));
});

// --- Screens use the safe helpers (source checks) -----------------------------------

test('Discover, Favorites, and the truck profile never render raw service_area', () => {
  for (const path of [
    'app/(customer)/(tabs)/discover.tsx',
    'app/(customer)/(tabs)/favorites.tsx',
    'components/TruckProfile.tsx',
  ]) {
    const source = readSource(path);
    assert.ok(!/\{truck\.service_area\}/.test(source), `${path} renders raw service_area`);
    assert.ok(source.includes('getTruckBasedNearText('), `${path} does not use the shared general-location helper`);
  }
});

test('Discover search does not match raw service_area or an offline serving address', () => {
  const discover = readSource('app/(customer)/(tabs)/discover.tsx');
  assert.ok(!/truck\.service_area \|\| ''/.test(discover));
  assert.ok(!/truck\.location\?\.address \|\| '',/.test(discover));
  assert.equal((discover.match(/getTruckSearchFields\(/g) ?? []).length, 3);
});

test('the truck profile Navigate button is gated on LIVE status', () => {
  const profile = readSource('components/TruckProfile.tsx');
  assert.ok(profile.includes('getTruckNavigationState({'));
  assert.ok(profile.includes("disabled={navigationState !== 'navigate'}"));
});

// --- Edit Profile -------------------------------------------------------------------

test('Edit Profile cannot write a home or street address into the LIVE locations row', () => {
  const editProfile = readSource('app/(truck)/edit-profile.tsx');
  assert.ok(!editProfile.includes('Address (Optional)'), 'address field still rendered');
  assert.ok(!/updates\.location\s*=/.test(editProfile), 'save still builds a location update');
  assert.ok(!/truck\.location\?/.test(editProfile), 'still reads the LIVE location row');
  assert.ok(!/setAddress\(/.test(editProfile), 'address state still present');
});
