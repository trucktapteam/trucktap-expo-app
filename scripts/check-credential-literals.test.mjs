import assert from 'node:assert/strict';
import test from 'node:test';
import { findCredentialLiterals } from './check-credential-literals.mjs';

test('credential scanner detects credential shapes without exposing their values', () => {
  const jwt = ['eyJ' + 'a'.repeat(24), 'b'.repeat(16), 'c'.repeat(16)].join('.');
  const findings = findCredentialLiterals(`authorization: Bearer ${jwt}`);

  assert.deepEqual(
    [...new Set(findings.map(({ name }) => name))].sort(),
    ['JWT literal', 'hard-coded Bearer token'],
  );
  assert.equal(findings.every((finding) => !('value' in finding)), true);
});

test('credential scanner permits environment-variable references', () => {
  assert.deepEqual(
    findCredentialLiterals('const token = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");'),
    [],
  );
});
