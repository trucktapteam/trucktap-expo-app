import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const executable = transpiled;
const environment = new Map();
const Deno = {
  serve: () => undefined,
  env: {
    get: key => environment.get(key),
  },
};
const supabaseModule = {
  createClient: () => {
    throw new Error('Database client should not be reached in authentication tests');
  },
};
const require = specifier => {
  if (specifier === 'npm:@supabase/supabase-js@2') return supabaseModule;
  throw new Error(`Unexpected test import: ${specifier}`);
};
const module = { exports: {} };

new Function('module', 'exports', 'Deno', 'require', executable)(
  module,
  module.exports,
  Deno,
  require
);

const { handler } = module.exports;
const secret = 'local-confirmation-test-secret';
const secretHeader = 'x-trucktap-webhook-secret';

const request = (providedSecret, body = {}) => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (providedSecret) headers.set(secretHeader, providedSecret);
  return new Request(
    'http://localhost/functions/v1/notify-hands-free-live-transition',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }
  );
};

test('missing dedicated secret is rejected', async () => {
  environment.set('HANDS_FREE_LIVE_WEBHOOK_SECRET', secret);
  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.equal(await response.text(), 'Unauthorized');
});

test('incorrect dedicated secret is rejected', async () => {
  environment.set('HANDS_FREE_LIVE_WEBHOOK_SECRET', secret);
  const response = await handler(request('incorrect-secret'));
  assert.equal(response.status, 401);
});

test('missing Edge Function secret configuration fails closed', async () => {
  environment.delete('HANDS_FREE_LIVE_WEBHOOK_SECRET');
  const response = await handler(request(secret));
  assert.equal(response.status, 401);
});

test('valid dedicated secret reaches strict event validation', async () => {
  environment.set('HANDS_FREE_LIVE_WEBHOOK_SECRET', secret);
  const response = await handler(request(secret, { event_id: 'not-a-uuid' }));
  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'Invalid event');
});
