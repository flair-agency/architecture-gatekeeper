import test from 'node:test';
import assert from 'node:assert/strict';
import { runGeminiReviewer } from '../dist/gemini-transport.mjs';

test('Gemini transport consumes synchronous and thenable fetch and JSON callbacks', async () => {
  const expected = { decision: 'BLOCK', summary: 'Synthetic response.' };
  const envelope = {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(expected) }] } }],
  };
  const thenableJson = {
    then(resolve) { return Promise.resolve(envelope).then(resolve); },
  };
  const callbacks = [
    () => ({ ok: true, status: 200, json: () => envelope }),
    () => ({ ok: true, status: 200, json: () => Promise.resolve(envelope) }),
    () => ({ ok: true, status: 200, json: () => thenableJson }),
    () => ({ then(resolve) { return Promise.resolve({ ok: true, status: 200, json: () => thenableJson }).then(resolve); } }),
  ];
  for (const fetch of callbacks) {
    const actual = await runGeminiReviewer({
      version: 1,
      repositoryRoot: '/synthetic',
      reviewedRevision: 'synthetic-revision',
      task: 'offline callback composition',
      prompt: 'offline synthetic review',
      schema: { type: 'object' },
      reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 },
      requestId: 'offline-request',
    }, { apiKey: 'fixture-key', fetch });
    assert.deepEqual(actual, expected);
  }
});
