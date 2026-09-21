import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runManualReviewCli, validate } from '../src/local-gate.mjs';

const cfg = { requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'] };
test('accepts explicit PASS scope', () => assert.equal(validate({ decision: 'PASS', authorityFiles: ['AGENTS.md'], reviewedScope: ['change'] }, cfg).decision, 'PASS'));
test('packages the manual review CLI', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.bin['architecture-review'], 'src/manual-review.mjs');
  assert.match(readFileSync(new URL('../src/manual-review.mjs', import.meta.url), 'utf8'), /runManualReviewCli\(\)/);
  assert.equal(typeof runManualReviewCli, 'function');
});
