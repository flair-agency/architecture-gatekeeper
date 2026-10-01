import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReviewTimeouts } from '../scripts/validate-review-timeouts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('accepts valid deadlines and derives the minimum job budget from the workflow step input', () => {
  assert.deepEqual(validateReviewTimeouts(7, 5), { jobTimeoutMinutes: 7, stepTimeoutMinutes: 5 });
  assert.deepEqual(validateReviewTimeouts(5, 5), { jobTimeoutMinutes: 6, stepTimeoutMinutes: 5 });
  assert.deepEqual(validateReviewTimeouts(7, 6), { jobTimeoutMinutes: 7, stepTimeoutMinutes: 6 });
  assert.deepEqual(validateReviewTimeouts(360, 359), { jobTimeoutMinutes: 360, stepTimeoutMinutes: 359 });
});

test('rejects malformed or out-of-range reviewer deadlines', () => {
  for (const [job, action] of [
    ['', 5], ['8.5', 5], ['361', 5], [8, '5m'], [8, 360],
  ]) assert.throws(() => validateReviewTimeouts(job, action));
});

test('wires only the primary review deadline from validated protected inputs', () => {
  const reusable = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const caller = readFileSync(join(root, '.github/workflows/self-architecture-gate.yml'), 'utf8');
  const integration = readFileSync(join(root, 'docs/integration-reference.md'), 'utf8');
  assert.match(reusable, /review-job-timeout-minutes:\n        type: number\n        default: 7/);
  assert.match(reusable, /review-step-timeout-minutes:\n        type: number\n        default: 5/);
  assert.match(reusable, /Validate bounded reviewer timeouts[\s\S]*?scripts\/validate-review-timeouts\.mjs/);
  assert.match(reusable, /review:\n[\s\S]*?timeout-minutes: \$\{\{ fromJSON\(needs\.policy\.outputs\.review_job_timeout_minutes\) \}\}/);
  assert.match(reusable, /name: Run read-only architecture review[\s\S]*?timeout-minutes: \$\{\{ fromJSON\(needs\.policy\.outputs\.review_step_timeout_minutes\) \}\}/);
  assert.match(reusable, /name: Run read-only architecture review[\s\S]*?timeout-seconds: "240"/);
  assert.match(caller, /review-job-timeout-minutes: \$\{\{ fromJSON\(vars\.ARCHITECTURE_GATE_REVIEW_JOB_TIMEOUT_MINUTES \|\| '7'\) \}\}/);
  assert.doesNotMatch(caller, /CODEX_TIMEOUT_SECONDS|codex-timeout-seconds/);
  assert.match(reusable, /owner-addition:\n[\s\S]*?timeout-minutes: 20/);
  assert.match(integration, /ARCHITECTURE_GATE_REVIEW_JOB_TIMEOUT_MINUTES/);
  assert.match(integration, /GitHub cancellation and process cleanup remain best-effort/);
});
