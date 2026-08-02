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

const { getTruckBusinessSnapshot } = await import('./truckBusinessSnapshot.ts');

const now = Date.parse('2026-08-01T12:00:00Z');

test('counts only this truck’s future, non-cancelled stops as Scheduled Stops', () => {
  const tiles = getTruckBusinessSnapshot({
    truckId: 'truck-1',
    now,
    upcomingStops: [
      { id: '1', truck_id: 'truck-1', starts_at: '2026-08-02T12:00:00Z', ends_at: '2026-08-02T14:00:00Z', status: 'scheduled' },
      { id: '2', truck_id: 'truck-1', starts_at: '2026-08-03T12:00:00Z', ends_at: '2026-08-03T14:00:00Z', status: 'cancelled' },
      { id: '3', truck_id: 'truck-1', starts_at: '2026-07-01T12:00:00Z', ends_at: '2026-07-01T14:00:00Z', status: 'scheduled' },
      { id: '4', truck_id: 'other-truck', starts_at: '2026-08-05T12:00:00Z', ends_at: '2026-08-05T14:00:00Z', status: 'scheduled' },
    ],
  });

  const stopsTile = tiles.find(tile => tile.id === 'scheduledStops');
  assert.equal(stopsTile.value, '1');
});

test('live status reflects current open state, not just recency', () => {
  const liveTiles = getTruckBusinessSnapshot({ openNow: true, liveUpdatedText: 'Last updated 2 min ago' });
  assert.equal(liveTiles.find(t => t.id === 'liveStatus').value, 'LIVE Now');

  const offlineTiles = getTruckBusinessSnapshot({ openNow: false, liveUpdatedText: 'Last updated 2 hr ago' });
  const offlineTile = offlineTiles.find(t => t.id === 'liveStatus');
  assert.equal(offlineTile.value, 'Not LIVE');
  assert.equal(offlineTile.detail, 'Last updated 2 hr ago');
});

test('reviews tile shows the average only once there is at least one review', () => {
  const noReviews = getTruckBusinessSnapshot({ reviewsCount: 0, reviewsAverage: 0 });
  assert.match(noReviews.find(t => t.id === 'reviews').detail, /no reviews yet/);

  const withReviews = getTruckBusinessSnapshot({ reviewsCount: 4, reviewsAverage: 4.5 });
  const reviewsTile = withReviews.find(t => t.id === 'reviews');
  assert.equal(reviewsTile.value, '4');
  assert.match(reviewsTile.detail, /4\.5 average/);
});

test('QR scans and check-ins pass through the given totals directly', () => {
  const tiles = getTruckBusinessSnapshot({ qrTotalScans: 42, checkInsThisMonth: 7 });
  assert.equal(tiles.find(t => t.id === 'qrScans').value, '42');
  assert.equal(tiles.find(t => t.id === 'checkIns').value, '7');
});

test('always returns exactly 5 tiles, even with no input at all', () => {
  const tiles = getTruckBusinessSnapshot({});
  assert.equal(tiles.length, 5);
});
