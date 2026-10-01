/**
 * src/gemini-transport.mjs
 * Gemini API transport for Architecture Gatekeeper reviews.
 * Zero external npm dependencies: uses native globalThis.fetch and Node.js standard library.
 */

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

  const effort = options.reasoningEffort || request.reviewer?.reasoningEffort;
  const budget = options.thinkingBudget ?? mapEffortToThinkingBudget(effort);
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
 * Executes an architecture review using the Gemini API.
 * Fails closed on any HTTP, network, timeout, or schema error.
 *
 * @param {object} request Review request created by createReviewRequest or createReviewRequestAsync
 * @param {object} [options]
 * @param {string} [options.apiKey] Gemini API Key (defaults to process.env.GEMINI_API_KEY)
 * @param {string} [options.model] Model name (defaults to request.reviewer.model or "gemini-2.5-flash")
 * @param {string} [options.baseUrl] Base API URL (defaults to Google Generative Language API)
 * @param {number} [options.timeoutMs] Review timeout in milliseconds
 * @param {typeof fetch} [options.fetch] Custom fetch implementation (useful for testing)
 * @returns {Promise<object>} Parsed decision JSON conforming to the requested schema
 */
export async function runGeminiReviewer(request, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Architecture gate reviewer failed: GEMINI_API_KEY is not set.');
  }

  const model = options.model || request.reviewer?.model || 'gemini-2.5-flash';
  const baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;

  const timeoutMs = options.timeoutMs || request.reviewer?.reviewTimeoutMs || 120000;
  const signal = AbortSignal.timeout(timeoutMs);

  const requestBody = prepareGeminiRequestBody(request, options);
  const fetchFn = options.fetch || globalThis.fetch;

  let response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
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

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Architecture gate reviewer returned empty or invalid response candidates.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Architecture gate reviewer returned non-JSON candidate content.');
  }
}
