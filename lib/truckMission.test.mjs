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

const { getTodaysMission } = await import('./truckMission.ts');
const {
  getDailyMissionStorageKey,
  getLocalCalendarDateKey,
  resolveDailyTruckMission,
} = await import('./truckDailyMission.ts');

const readyPublicReady = { complete: true, missing: [], isLegacy: true, bioRequired: false };

const baseCommandCenter = {
  health: 'Excellent',
  visibility: 'Profile Complete',
  nextAction: "Great Job — You're Ready",
  checklist: [],
  profileCompleteness: { complete: true, completedCount: 4, totalCount: 4, missing: [] },
  publicReady: readyPublicReady,
  eventReadiness: null,
};

const qrOpportunity = {
  id: 'put-qr-to-work',
  priority: 'high',
  icon: 'qr-code',
  title: 'Put Your QR Code to Work',
  description: 'desc',
  why: 'why',
  action: 'qrCenter',
};

const menuOpportunity = {
  id: 'complete-menu',
  priority: 'medium',
  icon: 'utensils',
  title: 'Complete Your Menu',
  description: 'desc',
  why: 'why',
  action: 'menu',
};

const announcementOpportunity = {
  id: 'share-announcement',
  priority: 'medium',
  icon: 'megaphone',
  title: 'Share an Announcement',
  description: 'desc',
  why: 'why',
  action: 'announcement',
};

const createMemoryStorage = () => {
  const values = new Map();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
};

test('a missing visibility field wins over everything else', () => {
  const commandCenter = {
    ...baseCommandCenter,
    publicReady: { complete: false, missing: ['logo'], isLegacy: true, bioRequired: false },
  };

  const mission = getTodaysMission(commandCenter, [qrOpportunity]);
  assert.equal(mission.kind, 'blocker');
  assert.equal(mission.title, 'Upload Your Logo');
});

test('name is checked before logo when both are missing', () => {
  const commandCenter = {
    ...baseCommandCenter,
    publicReady: { complete: false, missing: ['logo', 'name'], isLegacy: true, bioRequired: false },
  };

  const mission = getTodaysMission(commandCenter, []);
  assert.equal(mission.title, 'Add Your Truck Name');
});

test('an event starting soon overrides the top opportunity', () => {
  const commandCenter = { ...baseCommandCenter, eventReadiness: 'starts_soon' };
  const mission = getTodaysMission(commandCenter, [qrOpportunity]);
  assert.equal(mission.kind, 'urgent');
  assert.equal(mission.action, 'goLive');
});

test('an event already started is distinguished from starting soon', () => {
  const commandCenter = { ...baseCommandCenter, eventReadiness: 'started' };
  const mission = getTodaysMission(commandCenter, []);
  assert.equal(mission.title, 'Go LIVE Now');
});

test('with no blockers or urgency, the mission is the #1 ranked opportunity', () => {
  const mission = getTodaysMission(baseCommandCenter, [qrOpportunity, menuOpportunity]);
  assert.equal(mission.kind, 'opportunity');
  assert.equal(mission.title, qrOpportunity.title);
  assert.equal(mission.why, qrOpportunity.why);
  assert.equal(mission.sourceOpportunityId, 'put-qr-to-work');
});

test('with nothing blocking, urgent, or applicable, the mission is a steady-state message', () => {
  const mission = getTodaysMission(baseCommandCenter, []);
  assert.equal(mission.kind, 'steady');
  assert.ok(mission.why.length > 0);
  assert.equal(mission.action, 'none');
});

test('same truck and same local day remains on the persisted mission', async () => {
  const storage = createMemoryStorage();
  const date = new Date(2026, 7, 1, 9, 0, 0);
  const first = await resolveDailyTruckMission({
    truckId: 'truck-a', date, commandCenter: baseCommandCenter,
    opportunities: [qrOpportunity, menuOpportunity, announcementOpportunity],
  }, storage);
  const afterNavigation = await resolveDailyTruckMission({
    truckId: 'truck-a', date, commandCenter: baseCommandCenter,
    opportunities: [announcementOpportunity, menuOpportunity, qrOpportunity],
  }, storage);
  assert.equal(afterNavigation.sourceOpportunityId, first.sourceOpportunityId);
});

test('app restart reloads the same mission from persisted storage', async () => {
  const storage = createMemoryStorage();
  const input = {
    truckId: 'truck-restart',
    date: new Date(2026, 7, 1, 14, 0, 0),
    commandCenter: baseCommandCenter,
    opportunities: [qrOpportunity, menuOpportunity],
  };
  const beforeRestart = await resolveDailyTruckMission(input, storage);
  const afterRestart = await resolveDailyTruckMission({ ...input }, storage);
  assert.equal(afterRestart.sourceOpportunityId, beforeRestart.sourceOpportunityId);
});

test('the next local calendar day deterministically rotates when alternatives remain', async () => {
  const storage = createMemoryStorage();
  const opportunities = [qrOpportunity, menuOpportunity, announcementOpportunity];
  const first = await resolveDailyTruckMission({
    truckId: 'truck-rotate', date: new Date(2026, 7, 1, 12),
    commandCenter: baseCommandCenter, opportunities,
  }, storage);
  const nextDay = await resolveDailyTruckMission({
    truckId: 'truck-rotate', date: new Date(2026, 7, 2, 12),
    commandCenter: baseCommandCenter, opportunities,
  }, storage);
  assert.notEqual(nextDay.sourceOpportunityId, first.sourceOpportunityId);
});

test('different trucks persist independent daily missions', async () => {
  const storage = createMemoryStorage();
  const date = new Date(2026, 7, 1, 12);
  const opportunities = [qrOpportunity, menuOpportunity, announcementOpportunity];
  const truckA = await resolveDailyTruckMission({
    truckId: 'truck-a', date, commandCenter: baseCommandCenter, opportunities,
  }, storage);
  const truckB = await resolveDailyTruckMission({
    truckId: 'truck-b', date, commandCenter: baseCommandCenter, opportunities,
  }, storage);
  const dateKey = getLocalCalendarDateKey(date);
  assert.ok(storage.values.has(getDailyMissionStorageKey('truck-a', dateKey)));
  assert.ok(storage.values.has(getDailyMissionStorageKey('truck-b', dateKey)));
  assert.equal((await resolveDailyTruckMission({
    truckId: 'truck-a', date, commandCenter: baseCommandCenter, opportunities,
  }, storage)).sourceOpportunityId, truckA.sourceOpportunityId);
  assert.equal((await resolveDailyTruckMission({
    truckId: 'truck-b', date, commandCenter: baseCommandCenter, opportunities,
  }, storage)).sourceOpportunityId, truckB.sourceOpportunityId);
});

test('urgent mission overrides the persisted daily mission immediately', async () => {
  const storage = createMemoryStorage();
  const date = new Date(2026, 7, 1, 12);
  await resolveDailyTruckMission({
    truckId: 'truck-urgent', date, commandCenter: baseCommandCenter,
    opportunities: [qrOpportunity, menuOpportunity],
  }, storage);
  const urgent = await resolveDailyTruckMission({
    truckId: 'truck-urgent', date,
    commandCenter: { ...baseCommandCenter, eventReadiness: 'started' },
    opportunities: [qrOpportunity, menuOpportunity],
  }, storage);
  assert.equal(urgent.kind, 'urgent');
  assert.equal(urgent.title, 'Go LIVE Now');
});

test('completing the daily mission shows success instead of switching opportunities', async () => {
  const storage = createMemoryStorage();
  const date = new Date(2026, 7, 1, 12);
  const opportunities = [qrOpportunity, menuOpportunity, announcementOpportunity];
  const selected = await resolveDailyTruckMission({
    truckId: 'truck-complete', date, commandCenter: baseCommandCenter, opportunities,
  }, storage);
  const remaining = opportunities.filter(item => item.id !== selected.sourceOpportunityId);
  const completed = await resolveDailyTruckMission({
    truckId: 'truck-complete', date, commandCenter: baseCommandCenter, opportunities: remaining,
  }, storage);
  const stillCompleted = await resolveDailyTruckMission({
    truckId: 'truck-complete', date, commandCenter: baseCommandCenter, opportunities: remaining,
  }, storage);
  assert.equal(completed.kind, 'completed');
  assert.equal(stillCompleted.kind, 'completed');
  assert.equal(completed.action, 'none');
  assert.ok(remaining.every(item => item.id !== completed.sourceOpportunityId));
});
