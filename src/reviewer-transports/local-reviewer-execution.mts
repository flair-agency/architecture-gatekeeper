import type { PreparedReviewRequest, ReviewRequest, ReviewReviewerSettings } from '../review-contract/review-contract.mts';
import type { CodexReviewRequest } from './codex-transport.mts';

export type LocalReviewerResult = { decision: unknown; execution: unknown };
export type LocalReviewerEnvelope = { decision: unknown; execution: unknown };
type ThenMember<Result> = Result extends { then?: infer Then } ? Then : never;
type CallableThen = Function | (abstract new (...args: never[]) => unknown);
type LocalReviewerSyncRequestFor<Request extends ReviewRequest> = Request extends ReviewRequest
  ? Omit<Request, 'reviewer'> & { reviewer: Omit<ReviewReviewerSettings, 'provider'> & { provider?: 'codex' } }
  : never;
export type LocalReviewerSyncRequest = LocalReviewerSyncRequestFor<ReviewRequest>;
type SynchronousCallback<Result, Request extends LocalReviewerSyncRequest> = ((request: Request) => Result) &
  ([Extract<NonNullable<ThenMember<Result>>, CallableThen>] extends [never] ? unknown : never);
export type LocalReviewerAsyncRequest = ReviewRequest & { reviewer: ReviewRequest['reviewer'] & { reviewTimeoutMs: number } };
export type LocalReviewerControls = { signal: AbortSignal; timeoutMs?: number; [key: string]: unknown };
export type LocalReviewerSyncDefaultOptions = { reviewer?: undefined; reviewerResultFormat?: 'raw' };
export type LocalReviewerSyncCustomOptions<Result = unknown, Request extends LocalReviewerSyncRequest = LocalReviewerSyncRequest> =
  | { reviewer: SynchronousCallback<Result, Request>; reviewerResultFormat?: 'raw' }
  | { reviewer: SynchronousCallback<Result & LocalReviewerEnvelope, Request>; reviewerResultFormat: 'envelope' };
export type LocalReviewerSyncOptions<Result = unknown, Request extends LocalReviewerSyncRequest = LocalReviewerSyncRequest> = LocalReviewerSyncDefaultOptions | LocalReviewerSyncCustomOptions<Result, Request>;
type SyncOperationOptions = { reviewer?: (request: LocalReviewerSyncRequest) => unknown; reviewerResultFormat?: 'raw' | 'envelope' };
export type LocalReviewerAsyncDefaultOptions = { reviewer?: undefined; reviewerResultFormat?: 'raw'; [key: string]: unknown };
type LocalReviewerAsyncRawOptions<Request extends LocalReviewerAsyncRequest> = { reviewer: (request: Request, controls: LocalReviewerControls) => unknown; reviewerResultFormat?: 'raw'; [key: string]: unknown };
type LocalReviewerAsyncEnvelopeOptions<Request extends LocalReviewerAsyncRequest> = { reviewer: (request: Request, controls: LocalReviewerControls) => LocalReviewerEnvelope | PromiseLike<LocalReviewerEnvelope>; reviewerResultFormat: 'envelope'; [key: string]: unknown };
export type LocalReviewerAsyncCustomOptions<Request extends LocalReviewerAsyncRequest = LocalReviewerAsyncRequest> = LocalReviewerAsyncRawOptions<Request> | LocalReviewerAsyncEnvelopeOptions<Request>;
export type LocalReviewerAsyncOptions<Request extends LocalReviewerAsyncRequest = LocalReviewerAsyncRequest> = LocalReviewerAsyncDefaultOptions | LocalReviewerAsyncCustomOptions<Request>;
type ResultView = { decision: unknown; execution: unknown; then?: unknown };
type AsyncOperation = (request: LocalReviewerAsyncRequest, controls: LocalReviewerControls) => unknown;

import { runCodexReviewer } from './codex-transport.mts';
import { executeGeminiReviewer } from '../gemini-transport.mjs';

function selectedProvider(request: ReviewRequest): unknown {
  const reviewer = request?.reviewer;
  return reviewer && Object.hasOwn(reviewer, 'provider') ? reviewer.provider : 'codex';
}
function codexExecution(request: ReviewRequest) {
  return { provider: 'codex', requestedModel: request.reviewer.model, appliedSettings: { reasoningEffort: request.reviewer.reasoningEffort, reviewTimeoutMs: request.reviewer.reviewTimeoutMs } };
}
function normalizeResult(result: unknown, provider: unknown, request: ReviewRequest, { trustedDefaultAdapter = false, reviewerResultFormat }: { trustedDefaultAdapter?: boolean; reviewerResultFormat?: unknown } = {}): LocalReviewerResult {
  if (trustedDefaultAdapter && provider === 'gemini') {
    return { decision: (result as ResultView).decision, execution: (result as ResultView).execution };
  }
  if (reviewerResultFormat === 'envelope') {
    if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'decision') || !Object.hasOwn(result, 'execution')) throw new Error('Local reviewer envelope must contain decision and execution fields.');
    return { decision: (result as ResultView).decision, execution: (result as ResultView).execution };
  }
  return { decision: result, execution: trustedDefaultAdapter && provider === 'codex' ? codexExecution(request) : null };
}

// Local composition boundary. Adapters return a raw decision; callers retain
// revision-bound request construction and deterministic response validation.
// The existing synchronous Codex adapter remains the compatibility default.
export function executeLocalReviewerSync(request: CodexReviewRequest, options?: LocalReviewerSyncDefaultOptions): LocalReviewerResult;
export function executeLocalReviewerSync<Request extends LocalReviewerSyncRequest, Result>(request: Request, options: LocalReviewerSyncCustomOptions<Result, NoInfer<Request>>): LocalReviewerResult;
export function executeLocalReviewerSync<Request extends CodexReviewRequest, Result>(request: Request, options: LocalReviewerSyncOptions<Result, NoInfer<Request>>): LocalReviewerResult;
export function executeLocalReviewerSync(request: ReviewRequest, options: SyncOperationOptions = {}): LocalReviewerResult {
  const { reviewer = runCodexReviewer } = options;
  const provider = selectedProvider(request);
  if (provider !== 'codex') throw new Error(provider === 'gemini' ? 'Synchronous local review supports Codex only; Gemini requires the async review API.' : 'Local reviewer provider is unsupported.');
  validateResultFormat(options.reviewerResultFormat, reviewer === runCodexReviewer);
  if (typeof reviewer !== 'function') throw new Error('Local reviewer adapter must be a function.');
  const decision = reviewer(request as CodexReviewRequest);
  if (decision && typeof (decision as ResultView).then === 'function') {
    // Consume a possible rejection; never turn an async adapter into sync work.
    Promise.resolve(decision).catch(() => {});
    throw new Error('Asynchronous local reviewer requires the async review API.');
  }
  return normalizeResult(decision, 'codex', request, { trustedDefaultAdapter: reviewer === runCodexReviewer, reviewerResultFormat: options.reviewerResultFormat });
}

export function executeLocalReviewer<Request extends PreparedReviewRequest>(request: Request, options?: LocalReviewerAsyncOptions<NoInfer<Request>>): Promise<LocalReviewerResult>;
export function executeLocalReviewer<Request extends LocalReviewerAsyncRequest>(request: Request, options: LocalReviewerAsyncCustomOptions<NoInfer<Request>>): Promise<LocalReviewerResult>;
export async function executeLocalReviewer<Request extends LocalReviewerAsyncRequest>(request: Request, options: LocalReviewerAsyncOptions<Request> = {}): Promise<LocalReviewerResult> {
  const provider = selectedProvider(request);
  if (!['codex', 'gemini'].includes(provider as string)) throw new Error('Local reviewer provider is unsupported.');
  const reviewer = options.reviewer ?? (provider === 'gemini' ? executeGeminiReviewer : runCodexReviewer);
  validateResultFormat(options.reviewerResultFormat, !options.reviewer);
  if (typeof reviewer !== 'function') throw new Error('Local reviewer adapter must be a function.');
  const timeoutMs = request.reviewer?.reviewTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Local reviewer requires a recorded deadline.');
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Local reviewer timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });
    // Cooperative cancellation bounds result adoption, not physical execution.
    // Blocking adapters must enforce their own process deadline.
    const decision = await Promise.race([
      Promise.resolve().then(async () => {
        const result = await (reviewer as AsyncOperation)(request, provider === 'gemini' ? { ...options, timeoutMs, signal: controller.signal } : { signal: controller.signal });
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

function validateResultFormat(format: unknown, trustedDefaultAdapter: boolean): void {
  if (format !== undefined && format !== 'raw' && format !== 'envelope') throw new Error('Local reviewer result format is unsupported.');
  if (trustedDefaultAdapter && format === 'envelope') throw new Error('Built-in reviewer result format is fixed by its adapter.');
}
