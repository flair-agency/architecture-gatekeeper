import test from 'node:test';
import assert from 'node:assert/strict';
import { executeLocalReviewer, executeLocalReviewerSync } from '../src/local-reviewer-execution.mjs';

const request = { reviewer: { reviewTimeoutMs: 20 } };
test('deadline cancels cooperative adapter and never adopts its late PASS', async () => {
  let signal;
  let finish;
  const result = executeLocalReviewer(request, { reviewer: (_, controls) => {
    signal = controls.signal;
    return new Promise(resolve => { finish = resolve; });
  } });
  await assert.rejects(result, /timed out/);
  assert.equal(signal.aborted, true);
  finish({ decision: 'PASS' });
});
test('sync compatibility and async failures never manufacture a decision', async () => {
  const failure = () => { throw new Error('adapter unavailable'); };
  assert.throws(() => executeLocalReviewerSync(request, { reviewer: failure }), /unavailable/);
  await assert.rejects(executeLocalReviewer(request, { reviewer: failure }), /unavailable/);
  await assert.rejects(executeLocalReviewer({ reviewer: {} }), /recorded deadline/);
  assert.throws(() => executeLocalReviewerSync(request, { reviewer: async () => { throw new Error('async'); } }), /requires the async/);
});


test('sync provider rejection happens before any adapter dispatch', () => {
  let calls = 0;
  const reviewer = () => { calls += 1; return { decision: 'PASS' }; };
  assert.throws(() => executeLocalReviewerSync({ reviewer: { provider: 'gemini' } }, { reviewer }), /requires the async/);
  assert.throws(() => executeLocalReviewerSync({ reviewer: { provider: 'unknown' } }, { reviewer }), /Unsupported/);
  assert.equal(calls, 0);
});


test('async provider cannot silently fall back to Codex', async () => {
  await assert.rejects(executeLocalReviewer({ reviewer: { provider: 'gemini', reviewTimeoutMs: 50 } }), /no configured async adapter/);
  await assert.rejects(executeLocalReviewer({ reviewer: { provider: 'unknown', reviewTimeoutMs: 50 } }), /Unsupported/);
});
