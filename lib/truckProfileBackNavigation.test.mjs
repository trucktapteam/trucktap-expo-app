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
  resolveTruckProfileBackAction,
  CUSTOMER_DISCOVER_ROUTE,
} = await import('./truckProfileBackNavigation.ts');

test('when real navigation history exists, back() is used unchanged', () => {
  // Covers: opened normally from Discover/Map (always has history), and a
  // notification/deep-link replace() that landed on top of an existing
  // stack (e.g. the app was already open a few screens deep).
  assert.deepEqual(resolveTruckProfileBackAction(true), { type: 'back' });
});

test('when there is no navigation history, back action falls back to replacing with Discover', () => {
  // Covers: /truck/[id] launched as the root of the stack - cold start from
  // a push notification, QR/shared URL, universal/app link, trucktap://
  // scheme link, or native-intent cold start - where router.back() would
  // otherwise have nothing to pop and leave the customer stranded.
  assert.deepEqual(resolveTruckProfileBackAction(false), {
    type: 'replace',
    route: CUSTOMER_DISCOVER_ROUTE,
  });
});

test('the Discover fallback route is the customer tab route', () => {
  assert.equal(CUSTOMER_DISCOVER_ROUTE, '/(customer)/(tabs)/discover');
});
