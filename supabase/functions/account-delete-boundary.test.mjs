import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const functionSource = await readFile(
  new URL('./account-delete/index.ts', import.meta.url),
  'utf8',
);
const migrationSource = await readFile(
  new URL('../migrations/20260718060000_atomic_account_deletion.sql', import.meta.url),
  'utf8',
);

test('account deletion delegates all mutations to one atomic database primitive', () => {
  assert.match(functionSource, /\.rpc\(\s*"delete_customer_account"/u);
  assert.doesNotMatch(functionSource, /admin\.auth\.admin\.deleteUser/u);
  assert.doesNotMatch(
    functionSource,
    /\.from\(\s*"(?:favorites|profiles|reviews|sightings|truck_checkins)"\s*\)\s*\.(?:delete|update)/u,
  );
});

test('atomic account deletion is service-only and pins its search path', () => {
  assert.match(
    migrationSource,
    /security definer\s+set search_path = pg_catalog/iu,
  );
  assert.match(
    migrationSource,
    /revoke all on function public\.delete_customer_account\(uuid\)\s+from public, anon, authenticated/iu,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.delete_customer_account\(uuid\)\s+to service_role/iu,
  );
});
