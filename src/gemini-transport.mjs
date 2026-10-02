/**
 * src/gemini-transport.mjs
 * Gemini API transport for Architecture Gatekeeper reviews.
 * Zero external npm dependencies: uses native globalThis.fetch and Node.js standard library.
 */
import { spawnSync } from 'node:child_process';


/**
 * Remove root-level metadata like `$schema` from a JSON Schema
 * to ensure compatibility with Gemini's responseSchema expectations.
 * @param {Record<string, unknown>} schema
 * @returns {Record<string, unknown>}
 */
export function cleanJsonSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }
  const { $schema, ...cleaned } = schema;
  return cleaned;
}

// Model-supported thinking budget profiles.
// Values must be integers >= 0 within model boundaries.
const MODEL_THINKING_BUDGET_LIMITS = {
  'gemini-2.5-flash': { min: 0, max: 24576 },
  'gemini-2.5-pro': { min: 0, max: 32768 },
  'gemini-3.8-flash': { min: 0, max: 32768 },
};

/**
 * Validates thinkingBudget for a given model.
 * Enforces integer >= 0 within model profile limits (or general default [0, 65536]).
 * @param {string} model
 * @param {unknown} budget
 * @returns {number}
 */
export function validateThinkingBudget(model, budget) {
  if (budget === undefined || budget === null) {
    throw new Error('Architecture gate reviewer failed: missing thinkingBudget for Gemini route.');
  }
  if (!Number.isInteger(budget) || budget < 0) {
    throw new Error(`Architecture gate reviewer failed: thinkingBudget must be an integer >= 0, received: ${JSON.stringify(budget)}`);
  }
  const limits = MODEL_THINKING_BUDGET_LIMITS[model];
  if (!limits) {
    throw new Error(`Architecture gate reviewer failed: unknown or unsupported model profile '${model}' on Gemini route.`);
  }
  if (budget < limits.min || budget > limits.max) {
    throw new Error(
      `Architecture gate reviewer failed: thinkingBudget ${budget} exceeds supported bounds [${limits.min}, ${limits.max}] for model '${model}'.`
    );
  }
  return budget;
}

/**
 * Legacy compatibility adapter: maps reasoning effort strings (e.g. from legacy CLI/config)
 * to Gemini thinking budget values.
 *
 * NOTE: This is an explicit legacy adapter for standalone CLI/v1 compatibility only.
 * It must NOT select the recorded Gemini provider route.
 *
 * @param {string} effort
 * @returns {number | undefined}
 */
export function mapEffortToThinkingBudget(effort) {
  switch (effort) {
    case 'none':
      return 0;
    case 'minimal':
    case 'low':
      return 1024;
    case 'medium':
      return 4096;
    case 'high':
    case 'xhigh':
    case 'max':
    case 'ultra':
      return 16384;
    default:
      return undefined;
  }
}

/**
 * Resolves and validates the thinking budget for a review request.
 * Enforces mutual exclusivity: rejects mixed reasoningEffort and thinkingBudget settings.
 *
 * @param {object} reviewer
 * @param {object} [options]
 * @returns {{ budget: number, isExplicitGeminiRoute: boolean }}
 */
export function resolveReviewerThinkingBudget(reviewer, options = {}) {
  const isExplicitGemini = reviewer?.provider === 'gemini';

  // Reject mixed settings
  const hasThinkingBudget = reviewer?.thinkingBudget !== undefined || options?.thinkingBudget !== undefined;
  const hasReasoningEffort = reviewer?.reasoningEffort !== undefined || options?.reasoningEffort !== undefined;

  if (hasThinkingBudget && hasReasoningEffort) {
    throw new Error('Architecture gate reviewer failed: mixed thinkingBudget and reasoningEffort settings are not allowed.');
  }

  if (isExplicitGemini) {
    if (reviewer.reasoningEffort !== undefined) {
      throw new Error('Architecture gate reviewer failed: Gemini route does not accept reasoningEffort.');
    }
    if (options.reasoningEffort !== undefined) {
      throw new Error('Architecture gate reviewer failed: Gemini route does not accept options.reasoningEffort.');
    }
    if (reviewer.thinkingBudget === undefined) {
      throw new Error('Architecture gate reviewer failed: recorded reviewer configuration must specify thinkingBudget for provider=gemini.');
    }
    if (options.thinkingBudget !== undefined && options.thinkingBudget !== reviewer.thinkingBudget) {
      throw new Error('Architecture gate reviewer failed: thinkingBudget mismatch.');
    }
    const budget = validateThinkingBudget(reviewer.model, reviewer.thinkingBudget);
    return { budget, isExplicitGeminiRoute: true };
  }

  // If an explicit provider is specified and it is not 'gemini', reject it fail-closed
  if (reviewer?.provider && reviewer.provider !== 'gemini') {
    throw new Error(`Architecture gate reviewer failed: unsupported provider '${reviewer.provider}' on Gemini transport.`);
  }

  // Legacy / unrecorded route using reasoningEffort (ONLY when provider is omitted/undefined)
  if (!reviewer?.provider && reviewer?.reasoningEffort && typeof reviewer.reasoningEffort === 'string') {
    if (options.reasoningEffort && options.reasoningEffort !== reviewer.reasoningEffort) {
      throw new Error('Architecture gate reviewer failed: reasoningEffort mismatch.');
    }
    const budget = mapEffortToThinkingBudget(reviewer.reasoningEffort);
    if (budget === undefined) {
      throw new Error(`Architecture gate reviewer failed: unsupported reasoningEffort: ${reviewer.reasoningEffort}`);
    }
    return { budget, isExplicitGeminiRoute: false };
  }

  // Fallback: options.thinkingBudget provided explicitly on legacy route without provider
  if (!reviewer?.provider && options.thinkingBudget !== undefined) {
    const budget = validateThinkingBudget(reviewer?.model, options.thinkingBudget);
    return { budget, isExplicitGeminiRoute: false };
  }

  throw new Error('Architecture gate reviewer failed: missing or invalid reviewer reasoningEffort or thinkingBudget.');
}

/**
 * Prepares the request payload for Gemini generateContent API.
 * @param {object} request Review request created by review-contract
 * @param {object} [options]
 * @returns {object}
 */
export function prepareGeminiRequestBody(request, options = {}) {
  const prompt = request.prompt;
  const schema = cleanJsonSchema(request.schema);

  const { budget } = resolveReviewerThinkingBudget(request?.reviewer, options);

  const generationConfig = {
    responseMimeType: 'application/json',
    responseJsonSchema: schema,
    thinkingConfig: {
      thinkingBudget: budget,
    },
  };

  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig,
  };
}

/**
 * Attempts to obtain an OAuth access token from the local gcloud CLI.
 * Uses --quiet and a strict timeout to ensure it never hangs on interactive prompts.
 * @param {number} [timeoutMs=4000]
 * @returns {string | null}
 */
export function resolveGcloudAccessToken(timeoutMs = 4000) {
  try {
    const result = spawnSync('gcloud', ['auth', 'print-access-token', '--quiet'], {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status === 0 && result.stdout) {
      const token = result.stdout.trim();
      return token.length > 0 ? token : null;
    }
  } catch {
    // gcloud binary not found, timed out, or permission denied
  }
  return null;
}

/**
 * Resolves available authentication credentials with explicit precedence:
 * 1. Explicit option apiKey (options.apiKey)
 * 2. Explicit option accessToken (options.accessToken)
 * 3. Short-lived WIF / OAuth Bearer token from environment (CLOUDSDK_AUTH_ACCESS_TOKEN or GOOGLE_OAUTH_ACCESS_TOKEN)
 * 4. Static environment API key (GEMINI_API_KEY)
 * 5. Local gcloud CLI access token via `gcloud auth print-access-token`
 *
 * @param {object} [options]
 * @returns {{ type: 'apiKey' | 'bearer', value: string }}
 */
export function resolveAuthCredentials(options = {}) {
  if (options.apiKey && typeof options.apiKey === 'string' && options.apiKey.trim()) {
    return { type: 'apiKey', value: options.apiKey.trim() };
  }

  if (options.accessToken && typeof options.accessToken === 'string' && options.accessToken.trim()) {
    return { type: 'bearer', value: options.accessToken.trim() };
  }

  const envToken =
    process.env.CLOUDSDK_AUTH_ACCESS_TOKEN ||
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (envToken && typeof envToken === 'string' && envToken.trim()) {
    return { type: 'bearer', value: envToken.trim() };
  }

  const envApiKey = process.env.GEMINI_API_KEY;
  if (envApiKey && typeof envApiKey === 'string' && envApiKey.trim()) {
    return { type: 'apiKey', value: envApiKey.trim() };
  }

  const gcloudTimeoutMs = options.gcloudTimeoutMs ?? 4000;
  const resolveGcloud = options.resolveGcloudAccessToken || resolveGcloudAccessToken;
  const gcloudToken = resolveGcloud(gcloudTimeoutMs);
  if (gcloudToken) {
    return { type: 'bearer', value: gcloudToken };
  }

  throw new Error(
    'Architecture gate reviewer failed: No credentials found. Set GEMINI_API_KEY, GOOGLE_OAUTH_ACCESS_TOKEN, or authenticate with `gcloud auth login`.'
  );
}

/**
 * Resolves the appropriate base URL based on credentials and options.
 * Routes Bearer tokens to Vertex AI when a Google Cloud project is available,
 * and routes API keys to Google AI Studio.
 *
 * @param {{ type: 'apiKey' | 'bearer', value: string }} credentials
 * @param {object} [options]
 * @returns {string}
 */
export function resolveBaseUrl(credentials, options = {}) {
  if (options.baseUrl) {
    return options.baseUrl;
  }

  if (credentials.type === 'bearer') {
    const projectId =
      options.projectId ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.CLOUDSDK_CORE_PROJECT ||
      process.env.CLOUDSDK_PROJECT ||
      process.env.GCP_PROJECT;

    if (projectId && typeof projectId === 'string' && projectId.trim()) {
      const region =
        options.region ||
        process.env.GOOGLE_CLOUD_REGION ||
        process.env.CLOUDSDK_COMPUTE_REGION ||
        'us-central1';
      return `https://${region}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId.trim())}/locations/${encodeURIComponent(region)}/publishers/google`;
    }
  }

  return 'https://generativelanguage.googleapis.com/v1beta';
}

/**
 * Executes an architecture review using the Gemini API and returns both
 * the parsed decision and adapter-generated execution metadata.
 *
 * Implements Requirement 2 and 4 of the local provider execution contract:
 * - Returns `{ decision, execution }`
 * - Execution metadata is generated by the adapter (provider, requestedModel, appliedSettings, backendReportedModel)
 * - Model-produced identity fields are never used for execution provenance
 * - Propagates cooperative cancellation and enforces recorded deadline across credential resolution, fetch, and body consumption
 * - Timeout/cancellation/failure leaves review incomplete (no fallback, no late decision adoption)
 *
 * @param {object} request Review request created by review-contract
 * @param {object} [options]
 * @param {string} [options.apiKey] Gemini API Key
 * @param {string} [options.accessToken] Google OAuth Bearer token
 * @param {string} [options.projectId] Google Cloud project ID for Vertex AI
 * @param {string} [options.region] Google Cloud region for Vertex AI
 * @param {string} [options.model] Model name override (must match request.reviewer.model if both present)
 * @param {string} [options.baseUrl] Base API URL
 * @param {number} [options.timeoutMs] Review timeout in milliseconds
 * @param {AbortSignal} [options.signal] External cancellation signal
 * @param {typeof fetch} [options.fetch] Custom fetch implementation
 * @returns {Promise<{ decision: object, execution: { provider: string, requestedModel: string, appliedSettings: object, backendReportedModel?: string } }>}
 */
export async function executeGeminiReviewer(request, options = {}) {
  if (!request?.reviewer?.model || typeof request.reviewer.model !== 'string') {
    throw new Error('Architecture gate reviewer failed: missing or invalid reviewer model.');
  }
  if (options.model && options.model !== request.reviewer.model) {
    throw new Error('Architecture gate reviewer failed: model mismatch.');
  }
  const model = request.reviewer.model;

  // Resolve and validate thinking budget or effort
  const { budget } = resolveReviewerThinkingBudget(request.reviewer, options);

  const recordedTimeoutMs = request.reviewer?.reviewTimeoutMs ?? 120000;
  if (options.timeoutMs !== undefined) {
    if (typeof options.timeoutMs !== 'number' || options.timeoutMs <= 0 || options.timeoutMs > recordedTimeoutMs) {
      throw new Error('Architecture gate reviewer failed: timeoutMs cannot extend recorded reviewTimeoutMs.');
    }
  }
  const timeoutMs = options.timeoutMs ?? recordedTimeoutMs;
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;

  // Compose internal timeout signal with optional external signal
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => {
    timeoutController.abort(new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  const externalSignal = options.signal;
  if (externalSignal?.aborted) {
    clearTimeout(timeoutTimer);
    throw (externalSignal.reason instanceof Error ? externalSignal.reason : new Error('Architecture gate reviewer aborted.'));
  }

  const abortController = new AbortController();
  const onExternalAbort = () => {
    abortController.abort(externalSignal.reason instanceof Error ? externalSignal.reason : new Error('Architecture gate reviewer aborted.'));
  };
  const onTimeoutAbort = () => {
    abortController.abort(timeoutController.signal.reason);
  };

  if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

  const signal = abortController.signal;

  const cleanupSignals = () => {
    clearTimeout(timeoutTimer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
  };

  try {
    const remainingMs = Math.max(0, timeoutMs - (Date.now() - startTime));
    const gcloudTimeoutMs = Math.min(4000, remainingMs);

    const proxyUrl = options.proxyUrl || process.env.REVIEW_PROXY_URL;
    let credentials = null;
    let parsedProxyUrl = null;

    if (proxyUrl) {
      try {
        parsedProxyUrl = new URL(proxyUrl);
      } catch {
        throw new Error(`Architecture gate reviewer failed: invalid proxyUrl: ${proxyUrl}`);
      }
      if (parsedProxyUrl.hostname !== '127.0.0.1' && parsedProxyUrl.hostname !== 'localhost') {
        throw new Error(`Architecture gate reviewer failed: proxyUrl must bind to loopback (127.0.0.1), received: ${parsedProxyUrl.hostname}`);
      }
    } else {
      if (signal.aborted) {
        throw signal.reason || new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`);
      }
      credentials = resolveAuthCredentials({ ...options, gcloudTimeoutMs });
    }

    if (signal.aborted) {
      throw signal.reason || new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`);
    }

    // Validate endpoint and require HTTPS before transmitting credentials directly
    let baseUrl;
    let parsedUrl;
    if (parsedProxyUrl) {
      let cleanProxyUrl = proxyUrl;
      while (cleanProxyUrl.endsWith('/')) {
        cleanProxyUrl = cleanProxyUrl.slice(0, -1);
      }
      const isVertex = Boolean(options.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.CLOUDSDK_CORE_PROJECT);
      if (isVertex) {
        const projectId = options.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.CLOUDSDK_CORE_PROJECT || 'default';
        const region = options.region || process.env.GOOGLE_CLOUD_REGION || 'us-central1';
        baseUrl = `${cleanProxyUrl}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/publishers/google`;
      } else {
        baseUrl = `${cleanProxyUrl}/v1beta`;
      }
      parsedUrl = new URL(baseUrl);
    } else {
      baseUrl = resolveBaseUrl(credentials, options);
      try {
        parsedUrl = new URL(baseUrl);
      } catch {
        throw new Error(`Architecture gate reviewer failed: invalid baseUrl: ${baseUrl}`);
      }
      if (parsedUrl.protocol !== 'https:') {
        throw new Error(`Architecture gate reviewer failed: insecure endpoint protocol ${parsedUrl.protocol}. HTTPS is required to protect credentials.`);
      }
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;

    const requestBody = prepareGeminiRequestBody(request, options);
    const fetchFn = options.fetch || globalThis.fetch;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (credentials) {
      if (credentials.type === 'apiKey') {
        headers['x-goog-api-key'] = credentials.value;
      } else {
        headers['Authorization'] = `Bearer ${credentials.value}`;
      }
    }

    // Helper to race an async operation against cooperative deadline and abort signal
    const raceWithDeadline = (operationPromise) => {
      let expiredTimer;
      const remainingMs = Math.max(0, deadline - Date.now());
      const expiredPromise = new Promise((_, reject) => {
        if (signal.aborted || Date.now() >= deadline) {
          reject(signal.reason instanceof Error ? signal.reason : new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`));
          return;
        }
        expiredTimer = setTimeout(() => {
          reject(new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`));
        }, remainingMs);
        const onAbort = () => {
          clearTimeout(expiredTimer);
          reject(signal.reason instanceof Error ? signal.reason : new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });

      return Promise.race([
        operationPromise,
        expiredPromise,
      ]).finally(() => {
        clearTimeout(expiredTimer);
      });
    };

    let response;
    try {
      response = await raceWithDeadline(
        fetchFn(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          redirect: 'error',
          signal,
        })
      );
    } catch (error) {
      if (error.name === 'TimeoutError' || signal.aborted || Date.now() >= deadline) {
        throw new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`);
      }
      throw new Error(`Architecture gate reviewer network failure: ${error.message}`);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errJson = await raceWithDeadline(Promise.resolve().then(() => response.json()));
        detail = errJson?.error?.message ? `: ${errJson.error.message}` : '';
      } catch (err) {
        if (signal.aborted || Date.now() >= deadline) {
          throw new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`);
        }
        // ignore body parsing failure for HTTP error
      }
      throw new Error(`Architecture gate reviewer failed with status ${response.status}${detail}`);
    }

    let data;
    try {
      data = await raceWithDeadline(Promise.resolve().then(() => response.json()));
    } catch (error) {
      if (signal.aborted || Date.now() >= deadline) {
        throw new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`);
      }
      throw new Error('Architecture gate reviewer returned invalid HTTP JSON response.');
    }

    if (signal.aborted || Date.now() >= deadline) {
      throw new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`);
    }

    const candidate = data?.candidates?.[0];
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Architecture gate reviewer returned empty or invalid response candidates.');
    }

    if (candidate.finishReason !== 'STOP') {
      throw new Error(
        `Architecture gate reviewer candidate completion failed with finishReason: ${candidate.finishReason ?? 'MISSING'}`
      );
    }

    const parts = candidate.content?.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('Architecture gate reviewer returned empty or invalid response candidates.');
    }

    const answerParts = parts.filter(part => !part?.thought && typeof part?.text === 'string');
    if (answerParts.length === 0) {
      throw new Error('Architecture gate reviewer returned empty or invalid response candidates.');
    }

    const combinedText = answerParts.map(part => part.text).join('').trim();
    if (!combinedText) {
      throw new Error('Architecture gate reviewer returned empty or invalid response candidates.');
    }

    let parsedDecision;
    try {
      parsedDecision = JSON.parse(combinedText);
    } catch {
      throw new Error('Architecture gate reviewer returned non-JSON candidate content.');
    }

    // Build adapter-generated execution metadata
    // Provenance is adapter-generated, independent of model text/identity claims.
    const appliedSettings = {
      thinkingBudget: budget,
      reviewTimeoutMs: timeoutMs,
    };
    if (request.reviewer?.reasoningEffort) {
      appliedSettings.reasoningEffort = request.reviewer.reasoningEffort;
    }

    const execution = {
      provider: 'gemini',
      requestedModel: model,
      appliedSettings,
    };

    // Backend-reported model identity is recorded only when actually returned by the provider HTTP envelope
    if (typeof data?.modelVersion === 'string' && data.modelVersion.trim()) {
      execution.backendReportedModel = data.modelVersion.trim();
    }

    return {
      decision: parsedDecision,
      execution,
    };
  } finally {
    cleanupSignals();
  }
}

/**
 * Raw-decision transport API for Gemini reviewer.
 * Keeps backward compatibility: returns raw decision JSON directly.
 *
 * @param {object} request Review request created by review-contract
 * @param {object} [options]
 * @returns {Promise<object>} Parsed decision JSON conforming to the requested schema
 */
export async function runGeminiReviewer(request, options = {}) {
  const result = await executeGeminiReviewer(request, options);
  return result.decision;
}
