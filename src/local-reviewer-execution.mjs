import { runCodexReviewer } from './codex-transport.mjs';
import { executeGeminiReviewer } from './gemini-transport.mjs';

function selectedProvider(request) {
  const reviewer = request?.reviewer;
  return reviewer && Object.hasOwn(reviewer, 'provider') ? reviewer.provider : 'codex';
}
function codexExecution(request) {
  return { provider: 'codex', requestedModel: request.reviewer.model, appliedSettings: { reasoningEffort: request.reviewer.reasoningEffort, reviewTimeoutMs: request.reviewer.reviewTimeoutMs } };
}
function normalizeResult(result, provider, request, { trustedDefaultAdapter = false, reviewerResultFormat } = {}) {
  if (trustedDefaultAdapter && provider === 'gemini') {
    return { decision: result.decision, execution: result.execution };
  }
  if (reviewerResultFormat === 'envelope') {
    if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'decision') || !Object.hasOwn(result, 'execution')) throw new Error('Local reviewer envelope must contain decision and execution fields.');
    return { decision: result.decision, execution: result.execution };
  }
  return { decision: result, execution: trustedDefaultAdapter && provider === 'codex' ? codexExecution(request) : null };
}

// Local composition boundary. Adapters return a raw decision; callers retain
// revision-bound request construction and deterministic response validation.
// The existing synchronous Codex adapter remains the compatibility default.
export function executeLocalReviewerSync(request, options = {}) {
  const { reviewer = runCodexReviewer } = options;
  const provider = selectedProvider(request);
  if (provider !== 'codex') throw new Error(provider === 'gemini' ? 'Synchronous local review supports Codex only; Gemini requires the async review API.' : 'Local reviewer provider is unsupported.');
  validateResultFormat(options.reviewerResultFormat, reviewer === runCodexReviewer);
  if (typeof reviewer !== 'function') throw new Error('Local reviewer adapter must be a function.');
  const decision = reviewer(request);
  if (decision && typeof decision.then === 'function') {
    // Consume a possible rejection; never turn an async adapter into sync work.
    Promise.resolve(decision).catch(() => {});
    throw new Error('Asynchronous local reviewer requires the async review API.');
  }
  return normalizeResult(decision, 'codex', request, { trustedDefaultAdapter: reviewer === runCodexReviewer, reviewerResultFormat: options.reviewerResultFormat });
}

export async function executeLocalReviewer(request, options = {}) {
  const provider = selectedProvider(request);
  if (!['codex', 'gemini'].includes(provider)) throw new Error('Local reviewer provider is unsupported.');
  const reviewer = options.reviewer ?? (provider === 'gemini' ? executeGeminiReviewer : runCodexReviewer);
  validateResultFormat(options.reviewerResultFormat, !options.reviewer);
  if (typeof reviewer !== 'function') throw new Error('Local reviewer adapter must be a function.');
  const timeoutMs = request.reviewer?.reviewTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Local reviewer requires a recorded deadline.');
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let timer;
  try {
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Local reviewer timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });
    // Cooperative cancellation bounds result adoption, not physical execution.
    // Blocking adapters must enforce their own process deadline.
    const decision = await Promise.race([
      Promise.resolve().then(async () => {
        const result = await reviewer(request, provider === 'gemini' ? { ...options, timeoutMs, signal: controller.signal } : { signal: controller.signal });
        return normalizeResult(result, provider, request, { trustedDefaultAdapter: !options.reviewer, reviewerResultFormat: options.reviewerResultFormat });
      }),
      expired
    ]);
    if (Date.now() >= deadline) {
      controller.abort();
      throw new Error(`Local reviewer timed out after ${timeoutMs}ms.`);
    }
    return decision;
  } finally {
    clearTimeout(timer);
  }
}

function validateResultFormat(format, trustedDefaultAdapter) {
  if (format !== undefined && format !== 'raw' && format !== 'envelope') throw new Error('Local reviewer result format is unsupported.');
  if (trustedDefaultAdapter && format === 'envelope') throw new Error('Built-in reviewer result format is fixed by its adapter.');
}
