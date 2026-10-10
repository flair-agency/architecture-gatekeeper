import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLegacyValidationSelection } from '../dist/verify-legacy-validation-selection.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const facade = join(root, 'dist/verify-legacy-validation-selection.mjs');

test('flat compatibility facade retains exported equality checks and direct CLI behavior', () => {
  assert.deepEqual(verifyLegacyValidationSelection('', ''), { validationPath: null });
  assert.deepEqual(verifyLegacyValidationSelection('.codex/gatekeeper/decision.validation.json', '.codex/gatekeeper/decision.validation.json'), {
    validationPath: '.codex/gatekeeper/decision.validation.json',
  });
  assert.throws(() => verifyLegacyValidationSelection('', '.codex/gatekeeper/decision.validation.json'), /exactly match/);
  assert.throws(() => verifyLegacyValidationSelection('.codex/gatekeeper/decision.validation.json', ''), /exactly match/);
  const missing = spawnSync(process.execPath, [facade], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Usage: verify-legacy-validation-selection\.mjs/);
});

test('facade preserves basename suffix guard including imported-under-matching-argv behavior', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e',
    `process.argv[1] = '/tmp/verify-legacy-validation-selection.mjs.test'; await import(${JSON.stringify(facade)});`], { encoding: 'utf8' });
  assert.equal(result, '');
  const importedMissing = spawnSync(process.execPath, ['--input-type=module', '-e',
    `process.argv[1] = '/tmp/verify-legacy-validation-selection.mjs'; await import(${JSON.stringify(facade)});`], { encoding: 'utf8' });
  assert.notEqual(importedMissing.status, 0);
  assert.match(importedMissing.stderr, /Usage: verify-legacy-validation-selection\.mjs/);
  const mismatch = spawnSync(process.execPath, [facade, '', 'selected.json'], { encoding: 'utf8' });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /exactly match/);
  assert.equal(execFileSync(process.execPath, [facade, '', ''], { encoding: 'utf8' }), '');
});
