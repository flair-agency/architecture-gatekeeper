import { runManualReview, runManualReviewAsync, runHook as flatRunHook, runHookAsync } from '../../../src/local-gate.mts';
import { runHook } from '../../../src/local-review/local-gate.mts';
import type { PreparedGeminiReviewRequest, ReviewRequest } from '../../../src/review-contract/review-contract.mts';
import type { LocalReviewerSyncRequest } from '../../../src/reviewer-transports/local-reviewer-execution.mts';
declare const task: string;
declare const request: ReviewRequest;
type OptionalThenResult = { decision: string; then?: (...args: never[]) => unknown };
type MixedThenResult = { decision: string } | { decision: string; then?: (...args: never[]) => unknown };
type RequiredFunctionThenResult = { decision: string; then: Function };
type RequiredCallableFunctionThenResult = { decision: string; then: CallableFunction };
type OptionalFunctionThenResult = { decision: string; then?: Function };
type OptionalCallableFunctionThenResult = { decision: string; then?: CallableFunction };
type MixedFunctionThenResult = { decision: string } | { decision: string; then: Function };
type MixedCallableFunctionThenResult = { decision: string } | { decision: string; then?: CallableFunction };
const optionalThen = (_input: LocalReviewerSyncRequest): OptionalThenResult => ({ decision: 'PASS' });
const mixedThen = (_input: LocalReviewerSyncRequest): MixedThenResult => ({ decision: 'PASS' });
const requiredFunctionThen = (_input: LocalReviewerSyncRequest): RequiredFunctionThenResult => ({ decision: 'PASS', then: () => undefined });
const requiredCallableFunctionThen = (_input: LocalReviewerSyncRequest): RequiredCallableFunctionThenResult => ({ decision: 'PASS', then: () => undefined });
const optionalFunctionThen = (_input: LocalReviewerSyncRequest): OptionalFunctionThenResult => ({ decision: 'PASS' });
const optionalCallableFunctionThen = (_input: LocalReviewerSyncRequest): OptionalCallableFunctionThenResult => ({ decision: 'PASS' });
const mixedFunctionThen = (_input: LocalReviewerSyncRequest): MixedFunctionThenResult => ({ decision: 'PASS' });
const mixedCallableFunctionThen = (_input: LocalReviewerSyncRequest): MixedCallableFunctionThenResult => ({ decision: 'PASS' });
const geminiOnly = (input: PreparedGeminiReviewRequest) => input.reviewer.thinkingBudget;
declare const union: (request: ReviewRequest) => { decision: string } | Promise<{ decision: string }>;
// @ts-expect-error Local review requires a task.
runManualReview();
// @ts-expect-error Known promise callbacks are asynchronous.
runManualReview(task, '.', { reviewer: async () => ({ decision: 'PASS' }) });
// @ts-expect-error A promise branch in a union remains asynchronous.
runManualReview(task, '.', { reviewer: union });
// @ts-expect-error Callable thenables are asynchronous too.
runManualReview(task, '.', { reviewer: () => ({ decision: 'PASS', then() { return undefined; } }) });
// @ts-expect-error Optional callable then remains potentially asynchronous.
runManualReview(task, '.', { reviewer: optionalThen });
// @ts-expect-error A mixed raw/optional-then result union remains potentially asynchronous.
runManualReview(task, '.', { reviewer: mixedThen });
// @ts-expect-error A required broad Function-valued then is potentially callable.
runManualReview(task, '.', { reviewer: requiredFunctionThen });
// @ts-expect-error A required CallableFunction-valued then is asynchronous-shaped.
runManualReview(task, '.', { reviewer: requiredCallableFunctionThen });
// @ts-expect-error An optional broad Function-valued then remains potentially callable.
runManualReview(task, '.', { reviewer: optionalFunctionThen });
// @ts-expect-error An optional CallableFunction-valued then remains potentially callable.
runManualReview(task, '.', { reviewer: optionalCallableFunctionThen });
// @ts-expect-error A mixed raw/broad-Function then union remains potentially callable.
runManualReview(task, '.', { reviewer: mixedFunctionThen });
// @ts-expect-error A mixed raw/CallableFunction then union remains potentially callable.
runManualReview(task, '.', { reviewer: mixedCallableFunctionThen });
// @ts-expect-error The factory's provider is unknown here; synchronous callbacks are prepared for Codex, never Gemini.
runManualReview(task, '.', { reviewer: geminiOnly });
// @ts-expect-error Envelope mode requires both result fields.
runManualReview(task, '.', { reviewer: () => ({ decision: request.requestId }), reviewerResultFormat: 'envelope' });
// @ts-expect-error Unknown result-format names are rejected.
runManualReview(task, '.', { reviewerResultFormat: 'wrapper' });
// @ts-expect-error Async envelope results must include execution.
runManualReviewAsync(task, '.', { reviewer: async () => ({ decision: 'PASS' }), reviewerResultFormat: 'envelope' });
// @ts-expect-error Async task factories may select either provider, so Gemini-only callbacks are too narrow.
runManualReviewAsync(task, '.', { reviewer: geminiOnly });
// @ts-expect-error Hook JSON is supplied as text, not an unchecked object.
runHookAsync({ hook_event_name: 'UserPromptSubmit' });
// @ts-expect-error The synchronous hook path rejects known async callbacks.
runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }), '.', { reviewer: async () => 'PASS' });
// @ts-expect-error The grouped Hook export rejects required broad Function then callbacks.
runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }), '.', { reviewer: requiredFunctionThen });
// @ts-expect-error The grouped Hook export rejects optional CallableFunction then callbacks.
runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }), '.', { reviewer: optionalCallableFunctionThen });
// @ts-expect-error The grouped Hook export rejects mixed CallableFunction then callbacks.
runHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }), '.', { reviewer: mixedCallableFunctionThen });
// @ts-expect-error The flat Hook re-export also rejects broad Function-valued then callbacks.
flatRunHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }), '.', { reviewer: requiredFunctionThen });
// @ts-expect-error The flat Hook re-export also rejects optional CallableFunction then callbacks.
flatRunHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }), '.', { reviewer: optionalCallableFunctionThen });
// @ts-expect-error The flat Hook re-export also rejects mixed CallableFunction then callbacks.
flatRunHook(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's-1', prompt: task }), '.', { reviewer: mixedCallableFunctionThen });
