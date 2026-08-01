import assert from 'node:assert/strict';
import test from 'node:test';

import { getUpcomingStopReminderIds } from './upcomingStopReminders.ts';

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
