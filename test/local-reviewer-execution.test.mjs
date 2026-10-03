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

test('injected full caller decision objects stay raw in sync and async execution', async () => {
  const caller = { decision: 'PASS', execution: { consumerField: true }, authorityFiles: ['authority.md'] };
  assert.deepEqual(executeLocalReviewerSync(request, { reviewer: () => caller }), { decision: caller, execution: null });
  assert.deepEqual(await executeLocalReviewer(request, { reviewer: async () => caller }), { decision: caller, execution: null });
});

test('injected adapter envelopes require an explicit result format and preserve metadata', async () => {
  const envelope = { decision: { decision: 'PASS' }, execution: { provider: 'fixture', trace: 'adapter-owned' } };
  assert.deepEqual(await executeLocalReviewer(request, { reviewer: async () => envelope, reviewerResultFormat: 'envelope' }), {
    decision: envelope.decision, execution: envelope.execution
  });
  assert.deepEqual(await executeLocalReviewer(request, { reviewer: async () => envelope }), { decision: envelope, execution: null });
});

test('explicit null and unknown providers fail closed', async () => {
  await assert.rejects(executeLocalReviewer({ reviewer: { provider: null, reviewTimeoutMs: 20 } }, { reviewer: async () => ({ decision: 'PASS' }) }), /provider is unsupported/);
  assert.throws(() => executeLocalReviewerSync({ reviewer: { provider: null } }, { reviewer: () => ({ decision: 'PASS' }) }), /provider is unsupported/);
});
