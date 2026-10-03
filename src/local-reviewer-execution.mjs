import { runCodexReviewer } from './codex-transport.mjs';
import { executeGeminiReviewer } from './gemini-transport.mjs';

function selectedProvider(request) { return request?.reviewer?.provider ?? 'codex'; }
function codexExecution(request) {
  return { provider: 'codex', requestedModel: request.reviewer.model, appliedSettings: { reasoningEffort: request.reviewer.reasoningEffort, reviewTimeoutMs: request.reviewer.reviewTimeoutMs } };
}
function normalizeResult(result, provider, request, trustedDefaultAdapter = false) {
  if (result && typeof result === 'object' && Object.hasOwn(result, 'decision') && result.execution) {
    return { decision: result.decision, execution: trustedDefaultAdapter ? result.execution : null };
  }
  return { decision: result, execution: trustedDefaultAdapter && provider === 'codex' ? codexExecution(request) : null };
}

// Local composition boundary. Adapters return a raw decision; callers retain
// revision-bound request construction and deterministic response validation.
// The existing synchronous Codex adapter remains the compatibility default.
export function executeLocalReviewerSync(request, { reviewer = runCodexReviewer } = {}) {
  if (selectedProvider(request) !== 'codex') throw new Error('Synchronous local review supports Codex only; Gemini requires the async review API.');
  if (typeof reviewer !== 'function') throw new Error('Local reviewer adapter must be a function.');
  const decision = reviewer(request);
  if (decision && typeof decision.then === 'function') {
    // Consume a possible rejection; never turn an async adapter into sync work.
    Promise.resolve(decision).catch(() => {});
    throw new Error('Asynchronous local reviewer requires the async review API.');
  }
  return normalizeResult(decision, 'codex', request, reviewer === runCodexReviewer);
}

export async function executeLocalReviewer(request, options = {}) {
  const provider = selectedProvider(request);
  if (!['codex', 'gemini'].includes(provider)) throw new Error('Local reviewer provider is unsupported.');
  const reviewer = options.reviewer ?? (provider === 'gemini' ? executeGeminiReviewer : runCodexReviewer);
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
        return normalizeResult(result, provider, request, !options.reviewer);
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
