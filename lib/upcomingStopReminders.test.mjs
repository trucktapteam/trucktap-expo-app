import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getUpcomingStopReminderIds,
  getUpcomingStopReminderTime,
  hasUpcomingStopStarted,
} from './upcomingStopReminders.ts';

test('uses the full scheduled datetime when calculating a reminder', () => {
  const startsAt = '2026-08-03T11:00:00.000Z';
  const nowMs = Date.parse('2026-08-02T20:00:00.000Z');
  const thirtyMinuteReminder = getUpcomingStopReminderTime(startsAt, 30);
  const fifteenMinuteReminder = getUpcomingStopReminderTime(startsAt, 15);

  assert.equal(thirtyMinuteReminder?.toISOString(), '2026-08-03T10:30:00.000Z');
  assert.equal(fifteenMinuteReminder?.toISOString(), '2026-08-03T10:45:00.000Z');
  assert.ok(thirtyMinuteReminder.getTime() > nowMs);
  assert.ok(fifteenMinuteReminder.getTime() > nowMs);
  assert.equal(hasUpcomingStopStarted(startsAt, nowMs), false);
});

test('preserves timezone offsets when calculating a reminder', () => {
  const reminderAt = getUpcomingStopReminderTime('2026-08-03T10:00:00-04:00', 15);

  assert.equal(reminderAt?.toISOString(), '2026-08-03T13:45:00.000Z');
});

test('identifies already-started stops without treating future stops as historical', () => {
  const nowMs = Date.parse('2026-08-02T20:00:00.000Z');

  assert.equal(hasUpcomingStopStarted('2026-08-02T19:59:59.000Z', nowMs), true);
  assert.equal(hasUpcomingStopStarted('2026-08-03T11:00:00.000Z', nowMs), false);
  assert.equal(hasUpcomingStopStarted('not-a-date', nowMs), false);
});

test('derives reminder state from notifications actually scheduled by the OS', () => {
  assert.deepEqual(
    getUpcomingStopReminderIds([
      {
        identifier: 'notification-1',
        content: {
          data: {
            type: 'upcoming_stop_reminder',
            stop_id: 'stop-1',
          },
        },
      },
      {
        identifier: 'unrelated',
        content: {
          data: {
            type: 'owner_message',
            stop_id: 'stop-2',
          },
        },
      },
    ]),
    {
      'stop-1': 'notification-1',
    }
  );
});

test('supports the legacy stopId metadata key', () => {
  assert.deepEqual(
    getUpcomingStopReminderIds([
      {
        identifier: 'notification-2',
        content: {
          data: {
            type: 'upcoming_stop_reminder',
            stopId: 'stop-2',
          },
        },
      },
    ]),
    {
      'stop-2': 'notification-2',
    }
  );
});
