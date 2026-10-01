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

/**
 * Maps reasoning effort strings (e.g. from Gatekeeper's config)
 * to Gemini thinking budget values.
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
 * Prepares the request payload for Gemini generateContent API.
 * @param {object} request Review request created by review-contract
 * @param {object} [options]
 * @returns {object}
 */
export function prepareGeminiRequestBody(request, options = {}) {
  const prompt = request.prompt;
  const schema = cleanJsonSchema(request.schema);

  if (!request?.reviewer?.reasoningEffort || typeof request.reviewer.reasoningEffort !== 'string') {
    throw new Error('Architecture gate reviewer failed: missing or invalid reviewer reasoningEffort.');
  }
  if (options.reasoningEffort && options.reasoningEffort !== request.reviewer.reasoningEffort) {
    throw new Error('Architecture gate reviewer failed: reasoningEffort mismatch.');
  }
  const effort = request.reviewer.reasoningEffort;
  const budget = mapEffortToThinkingBudget(effort);
  if (budget === undefined) {
    throw new Error(`Architecture gate reviewer failed: unsupported reasoningEffort: ${effort}`);
  }

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
 * Resolves available authentication credentials with explicit fallback precedence:
 * 1. Explicit API key (options.apiKey or GEMINI_API_KEY)
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
 * Executes an architecture review using the Gemini API.
 * Fails closed on any HTTP, network, timeout, or schema error.
 *
 * @param {object} request Review request created by createReviewRequest or createReviewRequestAsync
 * @param {object} [options]
 * @param {string} [options.apiKey] Gemini API Key (defaults to process.env.GEMINI_API_KEY)
 * @param {string} [options.accessToken] Google OAuth Bearer token
 * @param {string} [options.projectId] Google Cloud project ID for Vertex AI
 * @param {string} [options.region] Google Cloud region for Vertex AI
 * @param {string} [options.model] Model name (defaults to request.reviewer.model or "gemini-3.8-flash")
 * @param {string} [options.baseUrl] Base API URL (defaults to Vertex AI for bearer or Generative Language API for apiKey)
 * @param {number} [options.timeoutMs] Review timeout in milliseconds
 * @param {typeof fetch} [options.fetch] Custom fetch implementation (useful for testing)
 * @returns {Promise<object>} Parsed decision JSON conforming to the requested schema
 */
export async function runGeminiReviewer(request, options = {}) {
  if (!request?.reviewer?.model || typeof request.reviewer.model !== 'string') {
    throw new Error('Architecture gate reviewer failed: missing or invalid reviewer model.');
  }
  if (options.model && options.model !== request.reviewer.model) {
    throw new Error('Architecture gate reviewer failed: model mismatch.');
  }
  const model = request.reviewer.model;

  if (!request?.reviewer?.reasoningEffort || typeof request.reviewer.reasoningEffort !== 'string') {
    throw new Error('Architecture gate reviewer failed: missing or invalid reviewer reasoningEffort.');
  }
  if (options.reasoningEffort && options.reasoningEffort !== request.reviewer.reasoningEffort) {
    throw new Error('Architecture gate reviewer failed: reasoningEffort mismatch.');
  }
  const budget = mapEffortToThinkingBudget(request.reviewer.reasoningEffort);
  if (budget === undefined) {
    throw new Error(`Architecture gate reviewer failed: unsupported reasoningEffort: ${request.reviewer.reasoningEffort}`);
  }

  const recordedTimeoutMs = request.reviewer?.reviewTimeoutMs ?? 120000;
  if (options.timeoutMs !== undefined) {
    if (typeof options.timeoutMs !== 'number' || options.timeoutMs <= 0 || options.timeoutMs > recordedTimeoutMs) {
      throw new Error('Architecture gate reviewer failed: timeoutMs cannot extend recorded reviewTimeoutMs.');
    }
  }
  const timeoutMs = options.timeoutMs ?? recordedTimeoutMs;
  const startTime = Date.now();
  const signal = AbortSignal.timeout(timeoutMs);

  const remainingMs = Math.max(0, timeoutMs - (Date.now() - startTime));
  const gcloudTimeoutMs = Math.min(4000, remainingMs);
  const credentials = resolveAuthCredentials({ ...options, gcloudTimeoutMs });

  // Validate endpoint and require HTTPS before transmitting credentials
  const baseUrl = resolveBaseUrl(credentials, options);
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error(`Architecture gate reviewer failed: invalid baseUrl: ${baseUrl}`);
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error(`Architecture gate reviewer failed: insecure endpoint protocol ${parsedUrl.protocol}. HTTPS is required to protect credentials.`);
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;

  const requestBody = prepareGeminiRequestBody(request, options);
  const fetchFn = options.fetch || globalThis.fetch;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (credentials.type === 'apiKey') {
    headers['x-goog-api-key'] = credentials.value;
  } else {
    headers['Authorization'] = `Bearer ${credentials.value}`;
  }

  let response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      redirect: 'error',
      signal,
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || signal.aborted) {
      throw new Error(`Architecture gate reviewer timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`Architecture gate reviewer network failure: ${error.message}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message ? `: ${errJson.error.message}` : '';
    } catch {
      // ignore body parsing failure
    }
    throw new Error(`Architecture gate reviewer failed with status ${response.status}${detail}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Architecture gate reviewer returned invalid HTTP JSON response.');
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

  try {
    return JSON.parse(combinedText);
  } catch {
    throw new Error('Architecture gate reviewer returned non-JSON candidate content.');
  }
}
