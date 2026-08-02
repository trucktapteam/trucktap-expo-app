import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUpcomingStopImagePath,
  extractUpcomingStopImagePath,
  validateUpcomingStopImageAsset,
} from './upcomingStopImageCore.ts';
import {
  getUpcomingStopImageUpdate,
  mapUpcomingStopRow,
  UPCOMING_STOP_PUBLIC_COLUMNS,
} from './upcomingStopData.ts';

const row = {
  id: 'stop-1',
  truck_id: 'truck-1',
  starts_at: '2026-08-02T16:00:00.000Z',
  ends_at: '2026-08-02T19:00:00.000Z',
  location_text: 'Main Street',
  note: null,
  status: 'scheduled',
};

test('upcoming stop image maps through reads and public queries', () => {
  const event_image_url = 'https://example.test/flyer.jpg';
  assert.equal(mapUpcomingStopRow({ ...row, event_image_url }).event_image_url, event_image_url);
  assert.match(UPCOMING_STOP_PUBLIC_COLUMNS, /event_image_url/);
});

test('a stop without an image remains null', () => {
  assert.equal(mapUpcomingStopRow(row).event_image_url, null);
});

test('replace and remove payloads preserve intentional null', () => {
  assert.deepEqual(getUpcomingStopImageUpdate(' https://example.test/new.jpg '), {
    event_image_url: 'https://example.test/new.jpg',
  });
  assert.deepEqual(getUpcomingStopImageUpdate(null), { event_image_url: null });
});

test('each stop in a multi-date batch gets its own storage path', () => {
  const first = buildUpcomingStopImagePath('truck-1', 'stop-1', 'asset', 'image/png');
  const second = buildUpcomingStopImagePath('truck-1', 'stop-2', 'asset', 'image/png');
  assert.equal(first, 'truck-1/stop-1/asset.png');
  assert.equal(second, 'truck-1/stop-2/asset.png');
  assert.notEqual(first, second);
});

test('storage paths round trip from a public URL', () => {
  const path = 'truck-1/stop-1/asset.webp';
  const url = `https://project.supabase.co/storage/v1/object/public/upcoming-stop-images/${path}`;
  assert.equal(extractUpcomingStopImagePath(url), path);
  assert.equal(extractUpcomingStopImagePath('https://example.test/not-ours.jpg'), null);
});

test('image asset validation rejects unsupported and oversized files', () => {
  assert.doesNotThrow(() => validateUpcomingStopImageAsset({ mimeType: 'image/jpeg', fileSize: 1024 }));
  assert.throws(() => validateUpcomingStopImageAsset({ mimeType: 'image/gif' }), /JPG, PNG, or WebP/);
  assert.throws(() => validateUpcomingStopImageAsset({ fileSize: 9 * 1024 * 1024 }), /8 MB/);
});
