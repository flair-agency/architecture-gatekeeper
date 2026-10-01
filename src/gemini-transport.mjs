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

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: schema,
  };

  if (options.reasoningEffort && options.reasoningEffort !== request.reviewer?.reasoningEffort) {
    throw new Error('Architecture gate reviewer failed: reasoningEffort mismatch.');
  }
  const effort = request.reviewer?.reasoningEffort;
  const budget = mapEffortToThinkingBudget(effort);
  if (typeof budget === 'number') {
    generationConfig.thinkingConfig = {
      thinkingBudget: budget,
    };
  }

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
 * 2. Explicit OAuth Bearer token (options.accessToken or GOOGLE_OAUTH_ACCESS_TOKEN)
 * 3. Local gcloud access token via `gcloud auth print-access-token`
 *
 * @param {object} [options]
 * @returns {{ type: 'apiKey' | 'bearer', value: string }}
 */
export function resolveAuthCredentials(options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    return { type: 'apiKey', value: apiKey.trim() };
  }

  const explicitToken =
    options.accessToken ||
    process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
    process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  if (explicitToken && typeof explicitToken === 'string' && explicitToken.trim()) {
    return { type: 'bearer', value: explicitToken.trim() };
  }

  const gcloudToken = resolveGcloudAccessToken();
  if (gcloudToken) {
    return { type: 'bearer', value: gcloudToken };
  }

  throw new Error(
    'Architecture gate reviewer failed: No credentials found. Set GEMINI_API_KEY, GOOGLE_OAUTH_ACCESS_TOKEN, or authenticate with `gcloud auth login`.'
  );
}

/**
 * Executes an architecture review using the Gemini API.
 * Fails closed on any HTTP, network, timeout, or schema error.
 *
 * @param {object} request Review request created by createReviewRequest or createReviewRequestAsync
 * @param {object} [options]
 * @param {string} [options.apiKey] Gemini API Key (defaults to process.env.GEMINI_API_KEY)
 * @param {string} [options.accessToken] Google OAuth Bearer token
 * @param {string} [options.model] Model name (defaults to request.reviewer.model or "gemini-2.5-flash")
 * @param {string} [options.baseUrl] Base API URL (defaults to Google Generative Language API)
 * @param {number} [options.timeoutMs] Review timeout in milliseconds
 * @param {typeof fetch} [options.fetch] Custom fetch implementation (useful for testing)
 * @returns {Promise<object>} Parsed decision JSON conforming to the requested schema
 */
export async function runGeminiReviewer(request, options = {}) {
  const credentials = resolveAuthCredentials(options);

  if (options.model && options.model !== request.reviewer?.model) {
    throw new Error('Architecture gate reviewer failed: model mismatch.');
  }
  const model = request.reviewer?.model || 'gemini-2.5-flash';
  const baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;

  const timeoutMs = options.timeoutMs || request.reviewer?.reviewTimeoutMs || 120000;
  const signal = AbortSignal.timeout(timeoutMs);

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

  const text = candidate.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Architecture gate reviewer returned empty or invalid response candidates.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Architecture gate reviewer returned non-JSON candidate content.');
  }
}
