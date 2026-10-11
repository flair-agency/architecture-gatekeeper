import { runManualReview, runManualReviewAsync, runHook, runHookAsync } from '../../../src/local-gate.mjs';
import { runManualReview as groupedReview, runManualReviewAsync as groupedReviewAsync,
  type ManualReviewAsyncOptions, type ManualReviewOutcome, type ManualReviewSyncOptions } from '../../../src/local-review/local-gate.mts';
import type { CodexReasoningEffort, PreparedCodexReviewRequest, PreparedReviewRequest,
  ReviewRequest } from '../../../src/review-contract/review-contract.mts';
import type { LocalReviewerControls, LocalReviewerSyncOptions, LocalReviewerSyncRequest } from '../../../src/reviewer-transports/local-reviewer-execution.mts';

declare const task: string;
declare const request: ReviewRequest;
const rawCallback = (input: ReviewRequest) => ({ decision: input.requestId, execution: undefined });
const syncOutcome: ManualReviewOutcome = runManualReview(task, '/repo', { reviewer: rawCallback });
groupedReview(task, '/repo', { reviewer: (input: ReviewRequest) => input.requestId });
runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }));

const nonCallableThen = (input: LocalReviewerSyncRequest) => ({ decision: input.requestId, then: 'ordinary data' });
groupedReview(task, '/repo', { reviewer: nonCallableThen });
const unknownResult = (input: LocalReviewerSyncRequest): unknown => input.requestId;
groupedReview(task, '/repo', { reviewer: unknownResult });
const aggregateSyncOptions: LocalReviewerSyncOptions<{ decision: string; then: string }> = {
  reviewer: nonCallableThen,
  reviewerResultFormat: 'raw',
};
const aggregateSyncOutcome: ManualReviewOutcome = runManualReview(task, '/repo', aggregateSyncOptions);
const codexOnlySync = (input: PreparedCodexReviewRequest) => {
  const effort: CodexReasoningEffort = input.reviewer.reasoningEffort;
  return { decision: effort };
};
const taskSyncOptions: ManualReviewSyncOptions<{ decision: CodexReasoningEffort }> = { reviewer: codexOnlySync };
groupedReview(task, '/repo', taskSyncOptions);
runManualReview(task, '/repo', taskSyncOptions);

const asyncRaw = (input: ReviewRequest, controls: { signal: AbortSignal }) => {
  void [input, controls.signal.aborted];
  return Promise.resolve({ decision: 'PASS' });
};
const asyncOutcome: Promise<ManualReviewOutcome> = runManualReviewAsync(task, '/repo', { reviewer: asyncRaw });
groupedReviewAsync(task, '/repo', { reviewer: asyncRaw });
runHookAsync(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-2', prompt: task }), '/repo', { reviewer: asyncRaw });
const preparedUnionAsync = (input: PreparedReviewRequest, controls: LocalReviewerControls) => {
  const timeout: number = input.reviewer.reviewTimeoutMs;
  if (input.reviewer.provider === 'gemini') {
    const budget: unknown = input.reviewer.thinkingBudget;
    void budget;
  } else {
    const effort: CodexReasoningEffort = input.reviewer.reasoningEffort;
    void effort;
  }
  void [timeout, controls.signal];
  return Promise.resolve(input.requestId);
};
const taskAsyncOptions: ManualReviewAsyncOptions = { reviewer: preparedUnionAsync };
groupedReviewAsync(task, '/repo', taskAsyncOptions);

const thenable: PromiseLike<{ decision: unknown; execution: unknown }> = {
  then<TResult1 = { decision: unknown; execution: unknown }, TResult2 = never>(
    fulfilled?: ((value: { decision: unknown; execution: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ decision: request.requestId, execution: undefined }).then(fulfilled, rejected);
  },
};
const envelope = (input: ReviewRequest) => ({ decision: input.requestId, execution: { source: 'local' } });
groupedReview(task, '/repo', { reviewer: envelope, reviewerResultFormat: 'envelope' });
runManualReviewAsync(task, '/repo', { reviewer: () => thenable, reviewerResultFormat: 'envelope' });
const cliResult: void = (await import('../../../src/local-review/local-gate.mts')).runManualReviewCli(['Review this']);

void [syncOutcome, asyncOutcome, cliResult, aggregateSyncOutcome];
