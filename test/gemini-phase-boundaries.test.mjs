import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGeminiReviewer } from '../dist/gemini-transport.mjs';
import { runIsolatedGeminiSession } from '../dist/gemini-launcher.mjs';

const request = () => ({
  prompt: 'Synthetic phase boundary review', schema: { type: 'object' },
  reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 },
});
const response = candidate => ({ ok: true, status: 200, json: () => ({ candidates: [candidate] }) });

test('candidate decoding preserves accessor rereads at the transport boundary', async () => {
  const reads = [];
  let textReads = 0;
  const part = {
    get thought() { reads.push('thought'); return false; },
    get text() {
      reads.push('text');
      return ++textReads === 1 ? 'filter observation' : '{"decision":"BLOCK"}';
    },
  };
  const result = await executeGeminiReviewer(request(), {
    apiKey: 'synthetic-secret', fetch: () => response({ finishReason: 'STOP', content: { parts: [part] } }),
  });
  assert.deepEqual(result.decision, { decision: 'BLOCK' });
  assert.deepEqual(reads, ['thought', 'text', 'text']);

  let finishReads = 0;
  await assert.rejects(executeGeminiReviewer(request(), {
    apiKey: 'synthetic-secret',
    fetch: () => response({ get finishReason() { return ++finishReads === 1 ? 'MAX_TOKENS' : 'SAFETY'; } }),
  }), { message: 'Architecture gate reviewer candidate completion failed with finishReason: SAFETY' });
  assert.equal(finishReads, 2);
});

test('launcher rejects malformed or unbounded session input before observing credentials', async () => {
  let credentialReads = 0;
  const options = {
    get credentialsOptions() { credentialReads++; throw new Error('credentials must remain unobserved'); },
  };
  for (const [argv, message] of [
    [['--api-key'], 'Missing --api-key credential value.'],
    [['--base-url=https://example.invalid'], 'Isolated sessions prohibit endpoint overrides; the launcher selects the proxy.'],
    [['--timeout=0'], 'Launcher requires a bounded session deadline that does not extend selected timeout.'],
  ]) {
    await assert.rejects(runIsolatedGeminiSession(argv, options), { message });
  }
  assert.equal(credentialReads, 0);
});
