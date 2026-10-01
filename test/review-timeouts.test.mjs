import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_REVIEW_JOB_TIMEOUT_MINUTES,
  REVIEW_ACTION_STEP_TIMEOUT_MINUTES,
  validateReviewTimeouts,
} from '../scripts/validate-review-timeouts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('accepts valid deadlines and raises the job minimum above the fixed Action step cap', () => {
  assert.deepEqual(validateReviewTimeouts(7, 240), { jobTimeoutMinutes: 7, codexTimeoutSeconds: 240 });
  assert.deepEqual(validateReviewTimeouts(5, 60), { jobTimeoutMinutes: 6, codexTimeoutSeconds: 60 });
  assert.deepEqual(validateReviewTimeouts(360, 240), { jobTimeoutMinutes: 360, codexTimeoutSeconds: 240 });
});

test('rejects malformed or out-of-range reviewer deadlines', () => {
  for (const [job, action] of [
    ['', 240], ['8.5', 240], ['361', 240], [8, '240s'], [8, 241], [8, 59],
  ]) assert.throws(() => validateReviewTimeouts(job, action));
});

test('wires only the primary review deadline from validated protected inputs', () => {
  const reusable = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const caller = readFileSync(join(root, '.github/workflows/self-architecture-gate.yml'), 'utf8');
  const integration = readFileSync(join(root, 'docs/integration-reference.md'), 'utf8');
  assert.match(reusable, /review-job-timeout-minutes:\n        type: number\n        default: 7/);
  assert.match(reusable, /codex-timeout-seconds:\n        type: number\n        default: 240/);
  assert.match(reusable, /Validate bounded reviewer timeouts[\s\S]*?scripts\/validate-review-timeouts\.mjs/);
  assert.match(reusable, /review:\n[\s\S]*?timeout-minutes: \$\{\{ fromJSON\(needs\.policy\.outputs\.review_job_timeout_minutes\) \}\}/);
  assert.match(reusable, /name: Run read-only architecture review[\s\S]*?timeout-seconds: \$\{\{ needs\.policy\.outputs\.codex_timeout_seconds \}\}/);
  assert.match(reusable, new RegExp(`name: Run read-only architecture review\\n        id: codex\\n        timeout-minutes: ${REVIEW_ACTION_STEP_TIMEOUT_MINUTES}`));
  assert.equal(MIN_REVIEW_JOB_TIMEOUT_MINUTES, REVIEW_ACTION_STEP_TIMEOUT_MINUTES + 1);
  assert.match(caller, /review-job-timeout-minutes: \$\{\{ fromJSON\(vars\.ARCHITECTURE_GATE_REVIEW_JOB_TIMEOUT_MINUTES \|\| '7'\) \}\}/);
  assert.match(caller, /codex-timeout-seconds: \$\{\{ fromJSON\(vars\.ARCHITECTURE_GATE_CODEX_TIMEOUT_SECONDS \|\| '240'\) \}\}/);
  assert.match(reusable, /owner-addition:\n[\s\S]*?timeout-minutes: 20/);
  assert.match(integration, /ARCHITECTURE_GATE_REVIEW_JOB_TIMEOUT_MINUTES/);
  assert.match(integration, /GitHub cancellation and process cleanup remain best-effort/);
});
