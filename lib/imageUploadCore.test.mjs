import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./imageUploadCore.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', transpiled)(module, module.exports);

const { computeUploadResizeTarget, IMAGE_UPLOAD_PRESETS } = module.exports;

test('returns null when the source is already within the cap', () => {
  assert.equal(computeUploadResizeTarget(1200, 800, 1600), null);
  assert.equal(computeUploadResizeTarget(1600, 900, 1600), null);
});

test('returns null when dimensions are missing or invalid', () => {
  assert.equal(computeUploadResizeTarget(undefined, 800, 1600), null);
  assert.equal(computeUploadResizeTarget(1200, null, 1600), null);
  assert.equal(computeUploadResizeTarget(0, 800, 1600), null);
  assert.equal(computeUploadResizeTarget(1200, -1, 1600), null);
});

test('scales down a landscape image, capping the long (width) side', () => {
  const target = computeUploadResizeTarget(4032, 3024, 1600);
  assert.deepEqual(target, { width: 1600, height: 1200 });
});

test('scales down a portrait image, capping the long (height) side', () => {
  // A 1080x1920 poster capture, well above every preset's cap.
  const target = computeUploadResizeTarget(1080, 1920, 1600);
  assert.deepEqual(target, { width: 900, height: 1600 });
});

test('scales down a square image', () => {
  const target = computeUploadResizeTarget(2000, 2000, 1000);
  assert.deepEqual(target, { width: 1000, height: 1000 });
});

test('every preset defines a positive maxDimension and a quality within (0, 1]', () => {
  for (const [name, preset] of Object.entries(IMAGE_UPLOAD_PRESETS)) {
    assert.ok(preset.maxDimension > 0, `${name} maxDimension should be positive`);
    assert.ok(preset.quality > 0 && preset.quality <= 1, `${name} quality should be in (0, 1]`);
  }
});
