import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatStopDuration,
  getStopDurationMinutes,
} from './upcomingStopTime.ts';

const atTime = (hour, minute = 0) => {
  const date = new Date(2026, 0, 1, hour, minute, 0, 0);
  return date;
};

test('rejects an earlier end time unless overnight is explicitly enabled', () => {
  assert.equal(getStopDurationMinutes(atTime(19), atTime(14), false), null);
  assert.equal(getStopDurationMinutes(atTime(19), atTime(14), true), 19 * 60);
});

test('calculates same-day and overnight durations for the owner preview', () => {
  assert.equal(getStopDurationMinutes(atTime(11), atTime(14), false), 3 * 60);
  assert.equal(getStopDurationMinutes(atTime(20), atTime(1), true), 5 * 60);
});

test('formats durations so unexpectedly long stops are visible', () => {
  assert.equal(formatStopDuration(19 * 60), '19 hr');
  assert.equal(formatStopDuration(5 * 60 + 30), '5 hr 30 min');
  assert.equal(formatStopDuration(null), null);
});
