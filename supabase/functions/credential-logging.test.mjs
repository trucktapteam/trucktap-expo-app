import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guardedFiles = [
  new URL('../../contexts/NotificationContext.tsx', import.meta.url),
  new URL('../../hooks/useAccountDeletion.ts', import.meta.url),
  new URL('./account-delete/index.ts', import.meta.url),
];

test('client and account deletion paths do not log credential values', async () => {
  const sources = await Promise.all(guardedFiles.map((file) => readFile(file, 'utf8')));
  const source = sources.join('\n');

  assert.doesNotMatch(source, /Expo Push Token:|Token preview:|Token received \(first/iu);
  assert.doesNotMatch(source, /(?:access_token|token)\.(?:slice|substring)\s*\(/u);
});
