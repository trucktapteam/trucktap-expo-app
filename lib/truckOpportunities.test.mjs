import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = path.join(libDir, '..');

const resolveAliasedPath = (absPathNoExt) => {
  if (fs.existsSync(`${absPathNoExt}.ts`)) return `${absPathNoExt}.ts`;
  if (fs.existsSync(path.join(absPathNoExt, 'index.ts'))) return path.join(absPathNoExt, 'index.ts');
  return `${absPathNoExt}.ts`;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const absPath = path.join(rootDir, specifier.slice(2));
      const withExt = /\.[a-z0-9]+$/i.test(absPath) ? absPath : resolveAliasedPath(absPath);
      return nextResolve(pathToFileURL(withExt).href, context);
    }
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { getTruckOpportunities } = await import('./truckOpportunities.ts');

const baseTruck = {
  id: 'truck-1',
  name: 'Taco Town',
  owner_id: 'owner-1',
  hero_image: 'https://example.invalid/hero.png',
  logo: 'https://example.invalid/logo.png',
  cuisine_type: 'Mexican',
  menu_images: [],
  images: ['a', 'b', 'c', 'd', 'e'],
  open_now: true,
  location: { latitude: 0, longitude: 0, address: '' },
  hours: 'Mon-Fri 11-2',
  bio: 'Great tacos.',
  phone: '555-5555',
  service_area: 'Downtown',
  verified: true,
  qrShared: true,
  reviews: [],
  menuItems: [
    { id: '1', truck_id: 'truck-1', name: 'Taco', description: '', price: 3, available: true },
    { id: '2', truck_id: 'truck-1', name: 'Burrito', description: '', price: 5, available: true },
    { id: '3', truck_id: 'truck-1', name: 'Nachos', description: '', price: 6, available: true },
    { id: '4', truck_id: 'truck-1', name: 'Quesadilla', description: '', price: 5, available: true },
    { id: '5', truck_id: 'truck-1', name: 'Elote', description: '', price: 4, available: true },
  ],
  announcements: [
    { id: 'a1', truck_id: 'truck-1', message: 'Hi', timestamp: new Date().toISOString() },
  ],
  upcomingStops: [
    { id: 's1', truck_id: 'truck-1', starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 90000000).toISOString(), status: 'scheduled' },
  ],
  customerCheckInsThisMonth: 3,
};

test('a fully set-up truck has no applicable opportunities', () => {
  const opportunities = getTruckOpportunities(baseTruck);
  assert.deepEqual(opportunities, []);
});

test('QR, Schedule, and Go LIVE are ranked high, in that order, when all three apply', () => {
  const truck = {
    ...baseTruck,
    qrShared: false,
    upcomingStops: [],
    open_now: false,
    lastLiveUpdatedAt: undefined,
  };

  const opportunities = getTruckOpportunities(truck);
  const highTier = opportunities.filter(o => o.priority === 'high').map(o => o.id);

  assert.deepEqual(highTier, ['put-qr-to-work', 'schedule-upcoming-stops', 'go-live-regularly']);
});

test('announcements, check-ins, menu, and gallery are ranked medium', () => {
  const truck = {
    ...baseTruck,
    announcements: [],
    customerCheckInsThisMonth: 0,
    menuItems: baseTruck.menuItems.slice(0, 2),
    images: ['a'],
  };

  const opportunities = getTruckOpportunities(truck);
  const mediumTier = opportunities.filter(o => o.priority === 'medium').map(o => o.id);

  assert.deepEqual(mediumTier, [
    'share-announcement',
    'customer-check-ins',
    'complete-menu',
    'gallery-photos',
  ]);
});

test('remaining profile polish is a single low-priority card, not one per field', () => {
  const truck = { ...baseTruck, bio: '', service_area: '', hours: '', operatingHours: undefined, hasOperatingHours: false };

  const opportunities = getTruckOpportunities(truck);
  const lowTier = opportunities.filter(o => o.priority === 'low');

  assert.equal(lowTier.length, 1);
  assert.equal(lowTier[0].id, 'remaining-profile-polish');
  assert.match(lowTier[0].description, /3 small details/);
});

test('an already-shared QR code does not surface the QR opportunity', () => {
  const opportunities = getTruckOpportunities({ ...baseTruck, qrShared: true });
  assert.ok(!opportunities.some(o => o.id === 'put-qr-to-work'));
});

test('archived and test trucks get no opportunities at all', () => {
  assert.deepEqual(getTruckOpportunities({ ...baseTruck, archived: true }), []);
  assert.deepEqual(getTruckOpportunities({ ...baseTruck, is_test: true }), []);
});
