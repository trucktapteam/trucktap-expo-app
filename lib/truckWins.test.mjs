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

const { getRecurringTruckWin, getTruckWins, fallbackTruckWin } = await import('./truckWins.ts');

const now = Date.parse('2026-08-01T12:00:00Z');
const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

test('scheduling 2+ stops this week outranks every other recurring win', () => {
  const win = getRecurringTruckWin({
    truckId: 'truck-1',
    now,
    openNow: true,
    checkInsThisMonth: 5,
    upcomingStops: [
      { id: '1', truck_id: 'truck-1', starts_at: daysAgo(-5), ends_at: daysAgo(-5), status: 'scheduled', created_at: daysAgo(1) },
      { id: '2', truck_id: 'truck-1', starts_at: daysAgo(-6), ends_at: daysAgo(-6), status: 'scheduled', created_at: daysAgo(2) },
    ],
  });

  assert.equal(win.id, 'stops-scheduled-this-week');
  assert.match(win.message, /scheduled 2 stops this week/);
});

test('being LIVE right now wins when fewer than 2 stops were scheduled this week', () => {
  const win = getRecurringTruckWin({ now, openNow: true, checkInsThisMonth: 5, upcomingStops: [] });
  assert.equal(win.id, 'live-now');
});

test('check-ins this month is the last real signal before falling back', () => {
  const win = getRecurringTruckWin({ now, openNow: false, checkInsThisMonth: 3, upcomingStops: [] });
  assert.equal(win.id, 'check-ins-this-month');
  assert.match(win.message, /^3 customers/);
});

test('a single check-in uses correct grammar', () => {
  const win = getRecurringTruckWin({ now, openNow: false, checkInsThisMonth: 1, upcomingStops: [] });
  assert.match(win.message, /^1 customer has/);
});

test('nothing applicable returns null, not a fabricated win', () => {
  const win = getRecurringTruckWin({ now, openNow: false, checkInsThisMonth: 0, upcomingStops: [] });
  assert.equal(win, null);
});

test('getTruckWins combines a milestone celebration with the recurring win, milestone first', () => {
  const wins = getTruckWins({ id: 'went_live', message: "You're LIVE!" }, { id: 'check-ins-this-month', kind: 'recurring', message: '3 customers...' });
  assert.equal(wins.length, 2);
  assert.equal(wins[0].kind, 'milestone');
  assert.equal(wins[1].kind, 'recurring');
});

test('getTruckWins never returns an empty list', () => {
  const wins = getTruckWins(null, null);
  assert.deepEqual(wins, [fallbackTruckWin]);
});
