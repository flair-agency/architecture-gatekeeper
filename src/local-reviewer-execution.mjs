import { runCodexReviewer } from './codex-transport.mjs';

// Local composition boundary. Adapters return a raw decision; callers retain
// revision-bound request construction and deterministic response validation.
// The existing synchronous Codex adapter remains the compatibility default.
export function executeLocalReviewerSync(request, { reviewer = runCodexReviewer } = {}) {
  if (typeof reviewer !== 'function') throw new Error('Local reviewer adapter must be a function.');
  const decision = reviewer(request);
  if (decision && typeof decision.then === 'function') {
    // Consume a possible rejection; never turn an async adapter into sync work.
    Promise.resolve(decision).catch(() => {});
    throw new Error('Asynchronous local reviewer requires the async review API.');
  }
  return decision;
}

export async function executeLocalReviewer(request, { reviewer = runCodexReviewer } = {}) {
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
      Promise.resolve().then(() => reviewer(request, { signal: controller.signal })),
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
