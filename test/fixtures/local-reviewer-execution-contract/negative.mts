import { executeLocalReviewer, executeLocalReviewerSync } from '../../../src/local-reviewer-execution.mjs';
import type { CodexReviewRequest } from '../../../src/reviewer-transports/codex-transport.mts';
import type { ReviewRequest } from '../../../src/review-contract/review-contract.mts';
import type { LocalReviewerAsyncRequest, LocalReviewerControls, LocalReviewerSyncRequest } from '../../../src/reviewer-transports/local-reviewer-execution.mts';
import type { PreparedGeminiReviewRequest, PreparedReviewRequest } from '../../../src/review-contract/review-contract.mts';
declare const request: ReviewRequest;
declare const timedRequest: LocalReviewerAsyncRequest;
declare const codexRequest: CodexReviewRequest;
declare const geminiRequest: PreparedGeminiReviewRequest;
// @ts-expect-error Both APIs require a complete shared request.
executeLocalReviewerSync();
// @ts-expect-error The async deadline is mandatory even with a custom adapter.
executeLocalReviewer(request);
// @ts-expect-error The request is mandatory.
executeLocalReviewer();
// @ts-expect-error The default Codex path requires selected settings and a recorded deadline.
executeLocalReviewerSync(request);
// @ts-expect-error Sync execution rejects a broad request that may select Gemini.
executeLocalReviewerSync(request, { reviewer: () => external });
// @ts-expect-error Sync execution accepts only Codex-compatible prepared settings.
executeLocalReviewerSync(geminiRequest, { reviewer: () => external });
// @ts-expect-error The default async path requires the provider-specific prepared settings union.
executeLocalReviewer(timedRequest);
// @ts-expect-error Empty options still select the bounded default path.
executeLocalReviewer(timedRequest, {});
// @ts-expect-error An explicit undefined reviewer still selects the bounded default path.
executeLocalReviewer(timedRequest, { reviewer: undefined });
// @ts-expect-error Empty options still select the bounded Codex default path.
executeLocalReviewerSync(request, {});
// @ts-expect-error An explicit undefined reviewer still selects the bounded Codex default path.
executeLocalReviewerSync(request, { reviewer: undefined });
// @ts-expect-error The synchronous API cannot advertise Promise adapters.
executeLocalReviewerSync(codexRequest, { reviewer: async () => ({ decision: 'PASS' }) });
// @ts-expect-error A custom thenable is also asynchronous.
executeLocalReviewerSync(codexRequest, { reviewer: () => ({ then: () => undefined }) });
// @ts-expect-error An envelope callback must provide both fields.
executeLocalReviewerSync(codexRequest, { reviewer: () => ({ decision: 'PASS' }), reviewerResultFormat: 'envelope' });
// @ts-expect-error An awaited envelope still requires execution.
executeLocalReviewer(timedRequest, { reviewer: async () => ({ decision: 'PASS' }), reviewerResultFormat: 'envelope' });
// @ts-expect-error Builtin result format cannot be changed to envelope.
executeLocalReviewer(timedRequest, { reviewerResultFormat: 'envelope' });
// @ts-expect-error Prepared Codex requests exclude Gemini thinking-budget settings.
executeLocalReviewerSync({ ...codexRequest, reviewer: { ...codexRequest.reviewer, thinkingBudget: 512 } });
// @ts-expect-error Result format is closed.
executeLocalReviewerSync(codexRequest, { reviewerResultFormat: 'unsupported' });
const result = executeLocalReviewerSync(codexRequest, { reviewer: () => ({ decision: external }) });
// @ts-expect-error Raw decision observations remain unknown.
const decision: string = result.decision;
// @ts-expect-error Execution observations remain unknown.
const execution: { provider: string } = result.execution;
void [decision, execution];

declare const preparedRequest: PreparedReviewRequest;
function isGeminiPreparedRequest(input: PreparedReviewRequest): input is PreparedGeminiReviewRequest {
  return input.reviewer.provider === 'gemini';
}
if (isGeminiPreparedRequest(preparedRequest)) {
  // @ts-expect-error The validated thinking-budget read remains unknown.
  const numericBudget: number = preparedRequest.reviewer.thinkingBudget;
  void numericBudget;
}
const geminiWithThinkingLevel = { ...geminiRequest, reviewer: { ...geminiRequest.reviewer, thinkingLevel: 'high' } };
// @ts-expect-error Gemini has no thinking-level field; only thinking budget is allowed.
executeLocalReviewer(geminiWithThinkingLevel);

declare const preparedUnionRequest: PreparedReviewRequest;
const onlyGeminiCallback = (input: PreparedGeminiReviewRequest, controls: LocalReviewerControls) => {
  void [input, controls];
  return external;
};
// @ts-expect-error A provider-specific callback cannot receive an unresolved Codex/Gemini union.
executeLocalReviewer(preparedUnionRequest, { reviewer: onlyGeminiCallback });
// @ts-expect-error A Gemini-only callback cannot receive a Codex request.
executeLocalReviewer(codexRequest, { reviewer: onlyGeminiCallback });
// @ts-expect-error A V2-only callback cannot receive a Gemini V1-or-V2 request.
executeLocalReviewer(geminiRequest, { reviewer: (input: Extract<PreparedGeminiReviewRequest, { version: 2 }>) => input.authoritySet });
// @ts-expect-error A provider-specific callback cannot require a narrower async request than supplied.
executeLocalReviewer(geminiRequest, { reviewer: (input: PreparedGeminiReviewRequest & { reviewer: { thinkingLevel: string } }) => input });

// @ts-expect-error A Codex-only callback cannot receive a partial synchronous custom request.
executeLocalReviewerSync(request as LocalReviewerSyncRequest, { reviewer: (input: CodexReviewRequest) => input });
// @ts-expect-error A Gemini callback cannot receive a Codex-compatible sync request.
executeLocalReviewerSync(codexRequest, { reviewer: (input: PreparedGeminiReviewRequest) => input });

declare const possiblyAsync: (request: ReviewRequest) => Promise<unknown> | { decision: string };
// @ts-expect-error Every known return branch must avoid callable then for the sync API.
executeLocalReviewerSync(codexRequest, { reviewer: possiblyAsync });
declare const possiblyThenableEnvelope: (request: ReviewRequest) =>
  { decision: unknown; execution: unknown } | { decision: unknown; execution: unknown; then(): void };
// @ts-expect-error A callable-then envelope branch is also asynchronous.
executeLocalReviewerSync(codexRequest, { reviewer: possiblyThenableEnvelope, reviewerResultFormat: 'envelope' });

declare const optionalCallableThen: (request: LocalReviewerSyncRequest) => { decision: unknown; then?: () => void };
// @ts-expect-error An optional callable then member can still be present at runtime.
executeLocalReviewerSync(codexRequest, { reviewer: optionalCallableThen });
declare const mixedOptionalThen: (request: LocalReviewerSyncRequest) => { decision: unknown; then?: (() => void) | string };
// @ts-expect-error A union containing a callable then member can still be asynchronous.
executeLocalReviewerSync(codexRequest, { reviewer: mixedOptionalThen });
declare const broadFunctionThen: (request: LocalReviewerSyncRequest) => { then: Function };
// @ts-expect-error Broad Function results include values the runtime recognizes as callable.
executeLocalReviewerSync(codexRequest, { reviewer: broadFunctionThen });
declare const optionalBroadFunctionThen: (request: LocalReviewerSyncRequest) => { then?: Function };
// @ts-expect-error An optional broad Function member can still be present at runtime.
executeLocalReviewerSync(codexRequest, { reviewer: optionalBroadFunctionThen });
declare const mixedBroadFunctionThen: (request: LocalReviewerSyncRequest) => { then?: Function | string };
// @ts-expect-error A mixed union with broad Function can still be callable.
executeLocalReviewerSync(codexRequest, { reviewer: mixedBroadFunctionThen });
declare const callableFunctionThen: (request: LocalReviewerSyncRequest) => { then: CallableFunction };
// @ts-expect-error CallableFunction is a known thenable return shape.
executeLocalReviewerSync(codexRequest, { reviewer: callableFunctionThen });
declare const constructFunctionThen: (request: LocalReviewerSyncRequest) => { then: abstract new () => unknown };
// @ts-expect-error A class constructor has runtime typeof "function" and is rejected by the existing then check.
executeLocalReviewerSync(codexRequest, { reviewer: constructFunctionThen });
