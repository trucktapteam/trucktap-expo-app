import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./handsFreeLive.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const stripped = transpiled
  .replace(/const supabase_1 = require\("@\/lib\/supabase"\);/, '')
  .replace(/supabase_1\./g, '__supabaseStub.');

const module = { exports: {} };
const __supabaseStub = { isSupabaseConfigured: false, supabase: {} };
new Function('module', 'exports', '__supabaseStub', stripped)(
  module,
  module.exports,
  __supabaseStub
);

const {
  isHandsFreeLiveRpcUnavailable,
  mapHandsFreeLiveOwnerSettings,
  mapUpcomingStopAutomationStatus,
} = module.exports;

test('detects a production backend without the automation RPCs', () => {
  assert.equal(
    isHandsFreeLiveRpcUnavailable({
      code: 'PGRST202',
      message: 'Could not find the function',
    }),
    true
  );
  assert.equal(
    isHandsFreeLiveRpcUnavailable({ code: '42501', message: 'Not authorized' }),
    false
  );
});

test('maps owner settings and keeps safe defaults', () => {
  assert.deepEqual(mapHandsFreeLiveOwnerSettings(null), {
    supported: false,
    systemEnabled: false,
    startGraceMinutes: 15,
    endGraceMinutes: 5,
    confirmationNotificationsEnabled: true,
  });

  assert.deepEqual(
    mapHandsFreeLiveOwnerSettings({
      system_enabled: true,
      start_grace_minutes: 10,
      end_grace_minutes: 3,
      confirmation_notifications_enabled: false,
    }),
    {
      supported: true,
      systemEnabled: true,
      startGraceMinutes: 10,
      endGraceMinutes: 3,
      confirmationNotificationsEnabled: false,
    }
  );
});

test('maps transparent owner-facing outcomes without internal coordinates', () => {
  const status = mapUpcomingStopAutomationStatus({
    stop_id: 'stop-a',
    enabled: true,
    status_code: 'blocked_manual_live',
    status_label: 'Blocked because already LIVE manually',
    status_detail: 'Your manual LIVE session was preserved and was not replaced.',
    auto_start_resolved_at: '2026-07-18T12:00:00Z',
  });

  assert.equal(status.stopId, 'stop-a');
  assert.equal(status.statusCode, 'blocked_manual_live');
  assert.equal(status.statusLabel, 'Blocked because already LIVE manually');
  assert.equal('latitude' in status, false);
  assert.equal('longitude' in status, false);
});
