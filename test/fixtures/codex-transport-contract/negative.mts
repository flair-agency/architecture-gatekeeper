import { runCodexReviewer } from '../../../src/codex-transport.mts';
import type { ReviewRequestV1, ValidatedReviewDecision } from '../../../src/review-contract/review-contract.mts';
import type { CodexReviewRequest } from '../../../src/reviewer-transports/codex-transport.mts';

declare const request: CodexReviewRequest;
declare const structuralGeminiLevel: { model: string; reasoningEffort: 'low'; reviewTimeoutMs: number; thinkingLevel: 'MEDIUM' };
// @ts-expect-error A prebuilt Codex reviewer cannot retain Gemini thinking levels.
runCodexReviewer({ ...request, reviewer: structuralGeminiLevel });
declare const generalRequest: ReviewRequestV1;
declare const structuralGeminiBudget: { model: string; reasoningEffort: 'low'; reviewTimeoutMs: number; thinkingBudget: number };
declare const reviewerUnion: { model: string; reasoningEffort: 'low'; reviewTimeoutMs: number } | { model: string; reasoningEffort: 'low'; reviewTimeoutMs: number; thinkingBudget: number };
// @ts-expect-error The request argument is required.
runCodexReviewer();
// @ts-expect-error The request must include its repository root.
runCodexReviewer({ ...request, repositoryRoot: undefined });
// @ts-expect-error An unrefined shared reviewer request does not guarantee Codex fields.
runCodexReviewer(generalRequest);
// @ts-expect-error Codex transport requires the recorded reviewer timeout.
runCodexReviewer({ ...request, reviewer: { model: 'codex-model', reasoningEffort: 'low' } });
// @ts-expect-error Codex transport requires the selected reasoning effort.
runCodexReviewer({ ...request, reviewer: { model: 'codex-model', reviewTimeoutMs: 1000 } });
// @ts-expect-error This transport cannot accept Gemini provider settings.
runCodexReviewer({ ...request, reviewer: { provider: 'gemini', model: 'gemini-model', thinkingBudget: 512, reviewTimeoutMs: 1000 } });
// @ts-expect-error Codex settings reject Gemini budget fields on structural variables.
runCodexReviewer({ ...request, reviewer: structuralGeminiBudget });
// @ts-expect-error The Codex contract rejects a union branch carrying a Gemini budget.
runCodexReviewer({ ...request, reviewer: reviewerUnion });
// @ts-expect-error Codex reviewer effort is limited to supported recorded values.
runCodexReviewer({ ...request, reviewer: { provider: 'codex', model: 'codex-model', reasoningEffort: 'turbo', reviewTimeoutMs: 1000 } });
// @ts-expect-error The Codex request alias also requires the timeout.
const missingTimeout: CodexReviewRequest = { ...request, reviewer: { model: 'codex-model', reasoningEffort: 'low' } };
// @ts-expect-error JSON read from the CLI output remains unknown.
const decision: string = runCodexReviewer(request);
// @ts-expect-error CLI JSON parsing does not validate the decision contract.
const validatedDecision: ValidatedReviewDecision = runCodexReviewer(request);
void [decision, validatedDecision, missingTimeout, structuralGeminiBudget, reviewerUnion];
