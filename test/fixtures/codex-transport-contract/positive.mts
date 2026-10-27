import { runCodexReviewer as runFlat } from '../../../src/codex-transport.mts';
import { runCodexReviewer } from '../../../src/reviewer-transports/codex-transport.mts';
import type { ReviewRequest } from '../../../src/review-contract/review-contract.mts';
import type { CodexReviewRequest } from '../../../src/reviewer-transports/codex-transport.mts';

const request: CodexReviewRequest = {
  version: 1,
  repositoryRoot: '/repo',
  reviewedRevision: 'revision',
  task: 'review task',
  prompt: 'review prompt',
  schema: { type: 'object' },
  reviewer: { model: 'codex-model', reasoningEffort: 'low', reviewTimeoutMs: 1000 },
  requestId: 'request-id',
};
const legacyReviewerRequest: CodexReviewRequest = {
  ...request,
  reviewer: { model: 'codex-model', reasoningEffort: 'low', reviewTimeoutMs: 1000 },
};
const explicitCodexRequest: CodexReviewRequest = { ...request, reviewer: { ...request.reviewer, provider: 'codex' } };
const generalRequest: ReviewRequest = request;
const flatObservation: unknown = runFlat(request);
const groupedObservation: unknown = runCodexReviewer(request);
const legacyObservation: unknown = runFlat(legacyReviewerRequest);
const explicitObservation: unknown = runCodexReviewer(explicitCodexRequest);
const directComposition: (input: CodexReviewRequest) => unknown = runCodexReviewer;
void [flatObservation, groupedObservation, legacyObservation, explicitObservation, directComposition, generalRequest];
