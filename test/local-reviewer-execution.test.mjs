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

test('sync Gemini selection fails before starting any adapter', () => {
  let started = false;
  assert.throws(() => executeLocalReviewerSync({ reviewer: { provider: 'gemini' } }, { reviewer: () => { started = true; } }), /Gemini requires the async/);
  assert.equal(started, false);
});

test('raw injected adapters do not receive fabricated provider identity', async () => {
  const result = await executeLocalReviewer(request, { reviewer: async () => ({ decision: 'PASS' }) });
  assert.deepEqual(result, { decision: { decision: 'PASS' }, execution: null });
});
