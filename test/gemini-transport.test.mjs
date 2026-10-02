import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanJsonSchema,
  executeGeminiReviewer,
  mapEffortToThinkingBudget,
  prepareGeminiRequestBody,
  runGeminiReviewer,
  resolveAuthCredentials,
  resolveBaseUrl,
  resolveGcloudAccessToken,
  validateThinkingBudget,
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
  assert.equal(body.generationConfig.responseJsonSchema.$schema, undefined);
  assert.equal(body.generationConfig.responseJsonSchema.type, 'object');
  assert.equal(body.generationConfig.responseSchema, undefined);
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 4096);
});

test('runGeminiReviewer fails closed when no credentials are found', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const prevToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const prevCloudsdkToken = process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  delete process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  try {
    const request = {
      prompt: 'test prompt',
      schema: { type: 'object' },
      reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'medium' },
    };
    await assert.rejects(
      () => runGeminiReviewer(request, { resolveGcloudAccessToken: () => null }),
      /No credentials found/
    );
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    if (prevToken !== undefined) process.env.GOOGLE_OAUTH_ACCESS_TOKEN = prevToken;
    if (prevCloudsdkToken !== undefined) process.env.CLOUDSDK_AUTH_ACCESS_TOKEN = prevCloudsdkToken;
  }
});

test('runGeminiReviewer fails closed on missing reviewer model or reasoningEffort', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [] }),
  });

  const requestNoModel = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { reasoningEffort: 'medium' },
  };
  await assert.rejects(
    () => runGeminiReviewer(requestNoModel, { apiKey: 'k', fetch: mockFetch }),
    /missing or invalid reviewer model/
  );

  const requestNoEffort = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash' },
  };
  await assert.rejects(
    () => runGeminiReviewer(requestNoEffort, { apiKey: 'k', fetch: mockFetch }),
    /missing or invalid reviewer reasoningEffort/
  );

  const requestInvalidEffort = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'unsupported-effort' },
  };
  await assert.rejects(
    () => runGeminiReviewer(requestInvalidEffort, { apiKey: 'k', fetch: mockFetch }),
    /unsupported reasoningEffort/
  );
});

test('runGeminiReviewer rejects timeout extension beyond recorded reviewer timeout', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [] }),
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: {
      model: 'gemini-2.5-flash',
      reasoningEffort: 'medium',
      reviewTimeoutMs: 180000,
    },
  };

  // Attempting to extend timeoutMs beyond recorded 180000ms must fail closed
  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'k', timeoutMs: 181000, fetch: mockFetch }),
    /timeoutMs cannot extend recorded reviewTimeoutMs/
  );
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
    assert.equal(options.redirect, 'error');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
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
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'medium', reviewTimeoutMs: 5000 },
  };

  const result = await runGeminiReviewer(request, {
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  assert.deepEqual(result, expectedDecision);
});

test('runGeminiReviewer rejects redirects on credential-bearing requests (fail-closed)', async () => {
  let attemptedFetchWithFollow = false;
  const mockFetchRedirect = async (_url, init) => {
    // Standard fetch with redirect: 'error' throws a TypeError when encountering a redirect
    if (init.redirect === 'error') {
      const err = new TypeError('Failed to fetch: unexpected redirect');
      throw err;
    }
    attemptedFetchWithFollow = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"decision": "PASS"}' }] } }],
      }),
    };
  };

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'secret-api-key', fetch: mockFetchRedirect }),
    /Architecture gate reviewer network failure: Failed to fetch: unexpected redirect/
  );
  assert.equal(attemptedFetchWithFollow, false);
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
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' },
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
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'test-api-key', fetch: mockFetchEmpty }),
    /empty or invalid response candidates/
  );

  const mockFetchInvalidJson = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'NOT_VALID_JSON' }] } }],
    }),
  });

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'test-api-key', fetch: mockFetchInvalidJson }),
    /non-JSON candidate content/
  );
});

test('runGeminiReviewer fails closed on missing, null, empty or non-STOP candidate finishReason', async () => {
  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' },
  };

  for (const invalidReason of [undefined, null, '', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER']) {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            ...(invalidReason !== undefined ? { finishReason: invalidReason } : {}),
            content: { parts: [{ text: '{"decision": "PASS"}' }] },
          },
        ],
      }),
    });

    await assert.rejects(
      () => runGeminiReviewer(request, { apiKey: 'test-api-key', fetch: mockFetch }),
      /candidate completion failed with finishReason:/
    );
  }
});

test('runGeminiReviewer correctly extracts final decision from thought-first and multipart response', async () => {
  const expectedDecision = {
    decision: 'BLOCK',
    summary: 'Final decision is BLOCK despite intermediate thought.',
  };

  const mockFetchThoughtAndMultipart = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              {
                thought: true,
                text: 'Thinking process: Initially thought about {"decision": "PASS"}...',
              },
              {
                text: '{"decision": "BLOCK", ',
              },
              {
                text: '"summary": "Final decision is BLOCK despite intermediate thought."}',
              },
            ],
          },
        },
      ],
    }),
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'medium' },
  };

  const result = await runGeminiReviewer(request, {
    apiKey: 'test-api-key',
    fetch: mockFetchThoughtAndMultipart,
  });

  assert.deepEqual(result, expectedDecision);
});

test('runGeminiReviewer fails closed when response contains only thought parts', async () => {
  const mockFetchThoughtOnly = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              {
                thought: true,
                text: 'Only thought content here...',
              },
            ],
          },
        },
      ],
    }),
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'medium' },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'test-api-key', fetch: mockFetchThoughtOnly }),
    /empty or invalid response candidates/
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
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'medium', reviewTimeoutMs: 120000 },
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

test('integrates with review-contract validateReviewResponse for deterministic validation', async () => {
  const { createReviewRequestAsync, validateReviewResponse } = await import('../src/review-contract.mjs');

  const request = await createReviewRequestAsync('Add Gemini transport module');
  const expectedDecision = {
    decision: 'PASS',
    summary: 'Architecture aligns with canonical authority.',
    authority: ['docs/architecture.md'],
    authorityFiles: ['docs/architecture.md'],
    authorityIds: request.authoritySet.members.map(m => m.id),
    responsibility: ['runtime'],
    capabilitySurface: ['Gemini transport'],
    qualityGuarantees: ['Fail closed and credential isolation'],
    reviewedScope: ['src/gemini-transport.mjs'],
    prohibitedChanges: ['none'],
    findings: [],
    gates: {
      sharedMechanism: {
        decision: 'PASS',
        summary: 'Adheres to configuration-bound reviewer settings.',
        consumerOwnership: 'Model and effort selections are bound to request.',
        failClosedBehavior: 'Fails closed on error and mismatch.',
        compatibility: 'Maintains full compatibility.',
        minimality: 'Minimal zero-dependency transport.',
      },
      trustBoundary: {
        decision: 'PASS',
        summary: 'Credentials are isolated.',
        tokenPermissions: 'Standard permissions.',
        untrustedInputs: 'Properly escaped.',
        credentialHandling: 'Never logged or leaked.',
        reportingIsolation: 'Clean isolation.',
      },
    },
  };

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify(expectedDecision) }] },
        },
      ],
    }),
  });

  const rawDecision = await runGeminiReviewer(request, {
    apiKey: 'test-api-key',
    fetch: mockFetch,
  });

  const validated = validateReviewResponse(request, rawDecision);
  assert.equal(validated.decision, 'PASS');
  assert.deepEqual(validated.authorityFiles, ['docs/architecture.md']);
  assert.deepEqual(validated.responsibility, ['runtime']);
});

test('runGeminiReviewer rejects model and reasoningEffort mismatches (fail-closed)', async () => {
  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: {
      model: 'gemini-2.5-flash',
      reasoningEffort: 'low',
    },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'k', model: 'gemini-1.5-pro' }),
    /model mismatch/
  );

  await assert.rejects(
    () => runGeminiReviewer(request, { apiKey: 'k', reasoningEffort: 'high' }),
    /reasoningEffort mismatch/
  );
});

test('resolveAuthCredentials prioritizes explicit apiKey over bearer token', () => {
  const creds = resolveAuthCredentials({
    apiKey: 'explicit-key',
    accessToken: 'explicit-token',
  });
  assert.deepEqual(creds, { type: 'apiKey', value: 'explicit-key' });
});

test('resolveAuthCredentials resolves explicit accessToken or environment token', () => {
  const creds = resolveAuthCredentials({
    accessToken: 'bearer-token-123',
  });
  assert.deepEqual(creds, { type: 'bearer', value: 'bearer-token-123' });

  const prevEnv = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const prevKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN = 'env-token-456';
    const envCreds = resolveAuthCredentials();
    assert.deepEqual(envCreds, { type: 'bearer', value: 'env-token-456' });
  } finally {
    if (prevEnv !== undefined) process.env.GOOGLE_OAUTH_ACCESS_TOKEN = prevEnv;
    else delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test('runGeminiReviewer sends Authorization Bearer header when bearer token is used', async () => {
  const expectedDecision = {
    decision: 'PASS',
    summary: 'Reviewed with Bearer token authentication.',
  };

  const mockFetch = async (url, options) => {
    assert.equal(options.headers['Authorization'], 'Bearer oauth-access-token-xyz');
    assert.equal(options.headers['x-goog-api-key'], undefined);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
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
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'medium' },
  };

  const result = await runGeminiReviewer(request, {
    accessToken: 'oauth-access-token-xyz',
    fetch: mockFetch,
  });

  assert.deepEqual(result, expectedDecision);
});

test('runGeminiReviewer rejects plaintext HTTP endpoints for API key credentials (fail-closed)', async () => {
  let attemptedFetch = false;
  const mockFetch = async () => {
    attemptedFetch = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, {
      apiKey: 'secret-api-key',
      baseUrl: 'http://insecure.endpoint.example/v1beta',
      fetch: mockFetch,
    }),
    /insecure endpoint protocol http:\. HTTPS is required to protect credentials\./
  );
  assert.equal(attemptedFetch, false);
});

test('runGeminiReviewer rejects plaintext HTTP endpoints for Bearer token credentials (fail-closed)', async () => {
  let attemptedFetch = false;
  const mockFetch = async () => {
    attemptedFetch = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' },
  };

  await assert.rejects(
    () => runGeminiReviewer(request, {
      accessToken: 'secret-bearer-token',
      baseUrl: 'http://insecure.endpoint.example/v1beta',
      fetch: mockFetch,
    }),
    /insecure endpoint protocol http:\. HTTPS is required to protect credentials\./
  );
  assert.equal(attemptedFetch, false);
});

test('runGeminiReviewer bounds credential discovery by review deadline', async () => {
  let observedGcloudTimeout = null;
  const mockResolveGcloud = (timeoutMs) => {
    observedGcloudTimeout = timeoutMs;
    return null;
  };

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low', reviewTimeoutMs: 1500 },
  };

  // With 1500ms reviewTimeoutMs, gcloudTimeoutMs should be bounded <= 1500ms rather than default 4000ms
  await assert.rejects(
    () => runGeminiReviewer(request, { resolveGcloudAccessToken: mockResolveGcloud }),
    /No credentials found/
  );
  assert.ok(observedGcloudTimeout !== null);
  assert.ok(observedGcloudTimeout <= 1500, `Expected <= 1500, got ${observedGcloudTimeout}`);
});

test('resolveAuthCredentials prioritizes environment short-lived WIF token over environment static API key', () => {
  const prevEnvToken = process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  const prevEnvKey = process.env.GEMINI_API_KEY;
  try {
    process.env.CLOUDSDK_AUTH_ACCESS_TOKEN = 'short-lived-wif-token';
    process.env.GEMINI_API_KEY = 'static-api-key';

    const creds = resolveAuthCredentials();
    assert.deepEqual(creds, { type: 'bearer', value: 'short-lived-wif-token' });
  } finally {
    if (prevEnvToken !== undefined) process.env.CLOUDSDK_AUTH_ACCESS_TOKEN = prevEnvToken;
    else delete process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
    if (prevEnvKey !== undefined) process.env.GEMINI_API_KEY = prevEnvKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test('resolveBaseUrl routes Bearer token to Vertex AI URL when project ID is present', () => {
  const creds = { type: 'bearer', value: 'token' };

  // Explicit options
  const urlWithOptions = resolveBaseUrl(creds, { projectId: 'my-gcp-project', region: 'asia-northeast1' });
  assert.equal(
    urlWithOptions,
    'https://asia-northeast1-aiplatform.googleapis.com/v1/projects/my-gcp-project/locations/asia-northeast1/publishers/google'
  );

  // Environment variables with default region us-central1
  const prevProject = process.env.GOOGLE_CLOUD_PROJECT;
  const prevRegion = process.env.GOOGLE_CLOUD_REGION;
  try {
    process.env.GOOGLE_CLOUD_PROJECT = 'env-gcp-project';
    delete process.env.GOOGLE_CLOUD_REGION;

    const envUrl = resolveBaseUrl(creds);
    assert.equal(
      envUrl,
      'https://us-central1-aiplatform.googleapis.com/v1/projects/env-gcp-project/locations/us-central1/publishers/google'
    );
  } finally {
    if (prevProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = prevProject;
    else delete process.env.GOOGLE_CLOUD_PROJECT;
    if (prevRegion !== undefined) process.env.GOOGLE_CLOUD_REGION = prevRegion;
    else delete process.env.GOOGLE_CLOUD_REGION;
  }
});

test('resolveBaseUrl routes apiKey credentials to Generative Language API', () => {
  const creds = { type: 'apiKey', value: 'api-key-123' };
  const prevProject = process.env.GOOGLE_CLOUD_PROJECT;
  try {
    process.env.GOOGLE_CLOUD_PROJECT = 'some-project';
    const url = resolveBaseUrl(creds);
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta');
  } finally {
    if (prevProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = prevProject;
    else delete process.env.GOOGLE_CLOUD_PROJECT;
  }
});

test('runGeminiReviewer automatically invokes Vertex AI endpoint when Bearer token and project ID are configured', async () => {
  let requestedUrl = null;
  let authorizationHeader = null;

  const mockFetch = async (url, options) => {
    requestedUrl = url;
    authorizationHeader = options.headers['Authorization'];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [{ text: JSON.stringify({ decision: 'PASS', summary: 'Vertex AI review completed' }) }],
            },
          },
        ],
      }),
    };
  };

  const prevToken = process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  const prevProject = process.env.GOOGLE_CLOUD_PROJECT;
  try {
    process.env.CLOUDSDK_AUTH_ACCESS_TOKEN = 'wif-bearer-token';
    process.env.GOOGLE_CLOUD_PROJECT = 'wif-ci-project';

    const request = {
      prompt: 'Verify architecture compliance on Vertex AI',
      schema: { type: 'object' },
      reviewer: { model: 'gemini-3.8-flash', reasoningEffort: 'low' },
    };

    const decision = await runGeminiReviewer(request, { fetch: mockFetch });
    assert.equal(decision.decision, 'PASS');
    assert.equal(
      requestedUrl,
      'https://us-central1-aiplatform.googleapis.com/v1/projects/wif-ci-project/locations/us-central1/publishers/google/models/gemini-3.8-flash:generateContent'
    );
    assert.equal(authorizationHeader, 'Bearer wif-bearer-token');
  } finally {
    if (prevToken !== undefined) process.env.CLOUDSDK_AUTH_ACCESS_TOKEN = prevToken;
    else delete process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
    if (prevProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = prevProject;
    else delete process.env.GOOGLE_CLOUD_PROJECT;
  }
});

test('validateThinkingBudget enforces integer bounds per model profile', () => {
  assert.equal(validateThinkingBudget('gemini-2.5-flash', 0), 0);
  assert.equal(validateThinkingBudget('gemini-2.5-flash', 2048), 2048);
  assert.equal(validateThinkingBudget('gemini-2.5-flash', 24576), 24576);

  // Exceeds flash max
  assert.throws(
    () => validateThinkingBudget('gemini-2.5-flash', 30000),
    /exceeds supported bounds/
  );

  // Negative or non-integer
  assert.throws(() => validateThinkingBudget('gemini-2.5-flash', -1), /must be an integer >= 0/);
  assert.throws(() => validateThinkingBudget('gemini-2.5-flash', 1024.5), /must be an integer >= 0/);
  assert.throws(() => validateThinkingBudget('gemini-2.5-flash', '1024'), /must be an integer >= 0/);
  assert.throws(() => validateThinkingBudget('gemini-2.5-flash', undefined), /missing thinkingBudget/);

  // Unknown or unsupported model profile fails closed
  assert.throws(
    () => validateThinkingBudget('unsupported-model', 1024),
    /unknown or unsupported model profile 'unsupported-model' on Gemini route/
  );
  assert.throws(
    () => validateThinkingBudget('unsupported-model', 65536),
    /unknown or unsupported model profile 'unsupported-model' on Gemini route/
  );

  // Inherited properties like constructor, toString, __proto__ fail closed
  for (const inheritedKey of ['constructor', 'toString', '__proto__', 'valueOf']) {
    assert.throws(
      () => validateThinkingBudget(inheritedKey, 1024),
      new RegExp(`unknown or unsupported model profile '${inheritedKey}' on Gemini route`)
    );
  }
});

test('explicit Gemini reviewer contract rejects reasoningEffort and accepts thinkingBudget', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify({ decision: 'PASS', summary: 'ok' }) }] },
        },
      ],
      modelVersion: 'gemini-2.5-flash-001',
    }),
  });

  // Rejects reasoningEffort when provider is gemini
  const invalidGeminiRequest = {
    prompt: 'Check compliance',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      reasoningEffort: 'low',
    },
  };
  await assert.rejects(
    () => executeGeminiReviewer(invalidGeminiRequest, { apiKey: 'k', fetch: mockFetch }),
    /Gemini route does not accept reasoningEffort/
  );

  // Rejects missing thinkingBudget in recorded reviewer configuration on provider=gemini
  const missingRecordedBudgetRequest = {
    prompt: 'Check compliance',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    },
  };
  await assert.rejects(
    () => executeGeminiReviewer(missingRecordedBudgetRequest, { apiKey: 'k', thinkingBudget: 2048, fetch: mockFetch }),
    /recorded reviewer configuration must specify thinkingBudget for provider=gemini/
  );

  // Rejects unknown model profile before network / credentials
  const unknownModelRequest = {
    prompt: 'Check compliance',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'unsupported-model',
      thinkingBudget: 1024,
    },
  };
  await assert.rejects(
    () => executeGeminiReviewer(unknownModelRequest, { apiKey: 'k', fetch: mockFetch }),
    /unknown or unsupported model profile 'unsupported-model' on Gemini route/
  );

  // Rejects mixed options
  const mixedRequest = {
    prompt: 'Check compliance',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      thinkingBudget: 2048,
    },
  };
  await assert.rejects(
    () => executeGeminiReviewer(mixedRequest, { apiKey: 'k', reasoningEffort: 'high', fetch: mockFetch }),
    /mixed thinkingBudget and reasoningEffort settings are not allowed/
  );

  // Rejects mismatched thinkingBudget options
  await assert.rejects(
    () => executeGeminiReviewer(mixedRequest, { apiKey: 'k', thinkingBudget: 4096, fetch: mockFetch }),
    /thinkingBudget mismatch/
  );

  // Valid explicit Gemini request returns decision and execution envelope
  const validRequest = {
    prompt: 'Check compliance',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      thinkingBudget: 2048,
      reviewTimeoutMs: 60000,
    },
  };

  const result = await executeGeminiReviewer(validRequest, { apiKey: 'k', fetch: mockFetch });
  assert.deepEqual(result.decision, { decision: 'PASS', summary: 'ok' });
  assert.equal(result.execution.provider, 'gemini');
  assert.equal(result.execution.requestedModel, 'gemini-2.5-flash');
  assert.equal(result.execution.appliedSettings.thinkingBudget, 2048);
  assert.equal(result.execution.appliedSettings.reviewTimeoutMs, 60000);
  assert.equal(result.execution.backendReportedModel, 'gemini-2.5-flash-001');

  // Compatibility: runGeminiReviewer returns raw decision
  const rawDecision = await runGeminiReviewer(validRequest, { apiKey: 'k', fetch: mockFetch });
  assert.deepEqual(rawDecision, { decision: 'PASS', summary: 'ok' });
});

test('fails closed before credential resolution when reviewer settings are invalid or mismatched', async () => {
  let credentialsTouched = false;
  const originalEnv = { ...process.env };
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  delete process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;

  // With no credentials in env and no apiKey passed, if it failed on credentials it would throw 'no credentials'
  // But settings validation must happen first!
  const requestMismatch = {
    prompt: 'test',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      thinkingBudget: 1024,
    },
  };

  await assert.rejects(
    () => executeGeminiReviewer(requestMismatch, { model: 'gemini-3.8-flash' }),
    /model mismatch/
  );

  await assert.rejects(
    () => executeGeminiReviewer(requestMismatch, { thinkingBudget: 2048 }),
    /thinkingBudget mismatch/
  );
});

test('enforces recorded deadline and cancellation during response body consumption', async () => {
  // Mock fetch that hangs or delays during response.json()
  const hangingFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      // Simulate slow body consumption that exceeds timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"decision":"PASS"}' }] } }],
      };
    },
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      thinkingBudget: 1024,
      reviewTimeoutMs: 30, // 30ms timeout, while response.json takes 100ms
    },
  };

  await assert.rejects(
    () => executeGeminiReviewer(request, { apiKey: 'k', fetch: hangingFetch }),
    /Architecture gate reviewer timed out after 30ms/
  );
});

test('races never-settling response body consumption against deadline for HTTP success', async () => {
  // Never settling promise for response.json() on ok: true
  const neverSettlingFetch = async () => ({
    ok: true,
    status: 200,
    json: () => new Promise(() => {}),
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      thinkingBudget: 1024,
      reviewTimeoutMs: 25,
    },
  };

  const start = Date.now();
  await assert.rejects(
    () => executeGeminiReviewer(request, { apiKey: 'k', fetch: neverSettlingFetch }),
    /Architecture gate reviewer timed out after 25ms/
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 20 && elapsed < 200, `Expected timeout around 25ms, got ${elapsed}ms`);
});

test('races never-settling response body consumption against deadline for HTTP error', async () => {
  // Never settling promise for response.json() on ok: false
  const neverSettlingErrorFetch = async () => ({
    ok: false,
    status: 500,
    json: () => new Promise(() => {}),
  });

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      thinkingBudget: 1024,
      reviewTimeoutMs: 25,
    },
  };

  const start = Date.now();
  await assert.rejects(
    () => executeGeminiReviewer(request, { apiKey: 'k', fetch: neverSettlingErrorFetch }),
    /Architecture gate reviewer timed out after 25ms/
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 20 && elapsed < 200, `Expected timeout around 25ms, got ${elapsed}ms`);
});

test('cooperative external signal cancellation aborts execution', async () => {
  const controller = new AbortController();
  controller.abort(new Error('Caller cancelled review'));

  const request = {
    prompt: 'test prompt',
    schema: { type: 'object' },
    reviewer: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      thinkingBudget: 1024,
      reviewTimeoutMs: 60000,
    },
  };

  await assert.rejects(
    () => executeGeminiReviewer(request, { apiKey: 'k', signal: controller.signal }),
    /Caller cancelled review/
  );
});



test('direct credentials cannot be dispatched outside selected official scope', async () => {
  const request = { prompt: 'review', schema: { type: 'object' }, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 } };
  let calls = 0;
  for (const baseUrl of ['https://example.com/v1beta', 'https://generativelanguage.googleapis.com/other', 'https://generativelanguage.googleapis.com/v1beta?key=other']) {
    await assert.rejects(executeGeminiReviewer(request, { apiKey: 'secret', baseUrl, fetch: async () => { calls++; } }), /selected official provider scope/);
  }
  assert.equal(calls, 0);
});

test('invalid recorded deadlines fail before credential lookup or fetch', async () => {
  for (const reviewTimeoutMs of [0, -1, Infinity, 1.5, 3600001]) {
    const request = { prompt: 'review', schema: {}, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024, reviewTimeoutMs } };
    await assert.rejects(executeGeminiReviewer(request, { resolveGcloudAccessToken: () => { throw new Error('Unexpected credential lookup'); } }), /bounded integer timeout/);
  }
});

test('verified Pro profile rejects disabled thinking and unsupported profiles', () => {
  assert.throws(() => validateThinkingBudget('gemini-2.5-pro', 0), /supported bounds/);
  assert.equal(validateThinkingBudget('gemini-2.5-pro', 128), 128);
  assert.throws(() => validateThinkingBudget('gemini-3.8-flash', 1024), /unsupported model profile/);
});


test('Vertex scope cannot inject an arbitrary host through region', async () => {
  const request = { prompt: 'review', schema: {}, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 } };
  let calls = 0;
  for (const region of ['example.com/path', 'example.com#', 'us-central1@evil.example']) {
    await assert.rejects(executeGeminiReviewer(request, { accessToken: 'fixture-token', projectId: 'p', region, fetch: async () => { calls++; } }), /invalid Vertex project or region scope/);
  }
  assert.equal(calls, 0);
});


test('canonical official endpoint permits trailing slash normalization', async () => {
  const request = { prompt: 'review', schema: {}, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 } };
  await executeGeminiReviewer(request, { apiKey: 'fixture', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/', fetch: async url => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"decision":"PASS"}' }] } }] }) };
  } });
});


test('decision extraction finishing after the deadline cannot return a semantic result', async () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const request = { prompt: 'review', schema: {}, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024, reviewTimeoutMs: 5 } };
    const part = { get text() { now = 1010; return '{"decision":"PASS"}'; } };
    await assert.rejects(executeGeminiReviewer(request, { apiKey: 'fixture', fetch: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [part] } }] }) }) }), /timed out after 5ms/);
  } finally { Date.now = originalNow; }
});


test('exhausted deadline never invokes credential discovery with an unlimited timeout', async () => {
  const savedNow = Date.now;
  let reads = 0, calls = 0;
  Date.now = () => reads++ === 0 ? 1000 : 1010;
  try {
    await assert.rejects(executeGeminiReviewer({ prompt: 'review', schema: {}, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024, reviewTimeoutMs: 5 } }, { resolveGcloudAccessToken: () => { calls++; return 'token'; } }), /timed out/);
    assert.equal(calls, 0);
  } finally { Date.now = savedNow; }
});

test('selected Studio proxy mode ignores unrelated project configuration and invalid modes do not dispatch', async () => {
  const request = { prompt: 'review', schema: { type: 'object' }, reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' } };
  let calls = 0;
  const fetch = async url => { calls++; assert.equal(new URL(url).pathname, '/v1beta/models/gemini-2.5-flash:generateContent'); return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"decision":"PASS"}' }] } }] }) }; };
  await runGeminiReviewer(request, { proxyUrl: 'http://127.0.0.1:1234', proxyMode: 'studio', projectId: 'unrelated-project', fetch });
  assert.equal(calls, 1);
  await assert.rejects(runGeminiReviewer(request, { proxyUrl: 'http://127.0.0.1:1234', proxyMode: 'invalid', fetch }), /Invalid selected proxy mode/);
  assert.equal(calls, 1);
});
