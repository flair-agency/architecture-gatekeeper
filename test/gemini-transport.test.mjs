import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanJsonSchema,
  mapEffortToThinkingBudget,
  prepareGeminiRequestBody,
  runGeminiReviewer,
} from '../src/gemini-transport.mjs';

test('cleanJsonSchema removes $schema while keeping properties and rules', () => {
  const input = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
      summary: { type: 'string' },
    },
    required: ['decision', 'summary'],
  };

  const cleaned = cleanJsonSchema(input);
  assert.equal(cleaned.$schema, undefined);
  assert.equal(cleaned.type, 'object');
  assert.deepEqual(cleaned.required, ['decision', 'summary']);
  assert.deepEqual(cleaned.properties, input.properties);
});

test('mapEffortToThinkingBudget maps effort levels to integer budgets', () => {
  assert.equal(mapEffortToThinkingBudget('none'), 0);
  assert.equal(mapEffortToThinkingBudget('low'), 1024);
  assert.equal(mapEffortToThinkingBudget('medium'), 4096);
  assert.equal(mapEffortToThinkingBudget('high'), 16384);
  assert.equal(mapEffortToThinkingBudget('unknown'), undefined);
});

test('prepareGeminiRequestBody formats prompt, schema, and thinking budget', () => {
  const request = {
    prompt: 'Review this architecture question.',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { decision: { type: 'string' } },
    },
    reviewer: {
      model: 'gemini-2.5-flash',
      reasoningEffort: 'medium',
    },
  };

  const body = prepareGeminiRequestBody(request);
  assert.equal(body.contents.length, 1);
  assert.equal(body.contents[0].role, 'user');
  assert.equal(body.contents[0].parts[0].text, 'Review this architecture question.');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseSchema.$schema, undefined);
  assert.equal(body.generationConfig.responseSchema.type, 'object');
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 4096);
});

test('runGeminiReviewer fails closed when GEMINI_API_KEY is not set', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const request = {
      prompt: 'test prompt',
      schema: { type: 'object' },
      reviewer: { model: 'gemini-2.5-flash' },
    };
    await assert.rejects(
      () => runGeminiReviewer(request),
      /GEMINI_API_KEY is not set/
    );
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test('runGeminiReviewer successfully returns parsed JSON on valid API response', async () => {
  const expectedDecision = {
    decision: 'PASS',
    summary: 'Architecture aligns with canonical authority.',
    authorityFiles: ['docs/architecture.md'],
    responsibility: ['runtime'],
    reviewedScope: ['src/gemini-transport.mjs'],
    prohibitedChanges: ['no secret exfiltration'],
  };

  const mockFetch = async (url, options) => {
    assert.match(url, /models\/gemini-2\.5-flash:generateContent/);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-goog-api-key'], 'test-api-key');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(expectedDecision) }],
            },
          },
        ],
      }),
    };
  };

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reviewTimeoutMs: 5000 },
  };

  const result = await runGeminiReviewer(request, {
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  assert.deepEqual(result, expectedDecision);
});

test('runGeminiReviewer fails closed on HTTP error response', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { message: 'API key expired' } }),
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash' },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'test-api-key', fetch: mockFetch }),
    /failed with status 403: API key expired/
  );
});

test('runGeminiReviewer fails closed on empty candidates or non-JSON text', async () => {
  const mockFetchEmpty = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [] }),
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash' },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'test-api-key', fetch: mockFetchEmpty }),
    /empty or invalid response candidates/
  );

  const mockFetchInvalidJson = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'NOT_VALID_JSON' }] } }],
    }),
  });

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'test-api-key', fetch: mockFetchInvalidJson }),
    /non-JSON candidate content/
  );
});

test('runGeminiReviewer fails closed on timeout', async () => {
  const mockFetchHanging = async (_url, { signal }) => {
    return new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const err = new Error('Simulated network hang');
        reject(err);
      }, 500);

      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted');
          err.name = 'TimeoutError';
          reject(err);
        },
        { once: true }
      );
    });
  };

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash' },
  };

  await assert.rejects(
    () =>
      runGeminiReviewer(request, {
        apiKey: 'test-api-key',
        timeoutMs: 30,
        fetch: mockFetchHanging,
      }),
    /timed out after 30ms/
  );
});

test('integrates with review-contract validateReviewResponse', async () => {
  const { createReviewRequest, validateReviewResponse } = await import('../src/review-contract.mjs');

  const root = process.cwd();
  // V1 request for unit integration testing
  const request = {
    version: 1,
    repositoryRoot: root,
    reviewedRevision: '0123456789abcdef0123456789abcdef01234567',
    task: 'Add Gemini transport module',
    prompt: 'Review this change',
    schema: {
      type: 'object',
      properties: {
        decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
        authorityFiles: { type: 'array', items: { type: 'string' } },
        responsibility: { type: 'array', items: { type: 'string' } },
        reviewedScope: { type: 'array', items: { type: 'string' } },
        prohibitedChanges: { type: 'array', items: { type: 'string' } },
      },
      required: ['decision', 'authorityFiles', 'responsibility', 'reviewedScope', 'prohibitedChanges'],
    },
    reviewer: {
      model: 'gemini-2.5-flash',
      reasoningEffort: 'low',
      reviewTimeoutMs: 5000,
    },
    requestId: 'test-req-id',
  };

  const expectedDecision = {
    decision: 'PASS',
    authorityFiles: ['AGENTS.md'],
    responsibility: ['runtime'],
    reviewedScope: ['src/gemini-transport.mjs'],
    prohibitedChanges: ['none'],
  };

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(expectedDecision) }] } },
      ],
    }),
  });

  const decision = await runGeminiReviewer(request, {
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  assert.equal(decision.decision, 'PASS');
  assert.deepEqual(decision.authorityFiles, ['AGENTS.md']);
});
