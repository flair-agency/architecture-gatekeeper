import { runPostToolScreenHook } from '../../../src/local-review/local-post-tool-screen.mts';
import type { PostToolScreenOptions } from '../../../src/local-review/local-post-tool-screen.mts';
import type { PreparedGeminiReviewRequest } from '../../../src/review-contract/review-contract.mts';
import type { LocalReviewerAsyncRequest, LocalReviewerControls } from '../../../src/reviewer-transports/local-reviewer-execution.mts';

const missingDeadline: (request: LocalReviewerAsyncRequest) => unknown = request => {
  // @ts-expect-error the request produced by review-context preparation records a deadline
  const timeout: string = request.reviewer.reviewTimeoutMs;
  return timeout;
};
const geminiOnly = (request: PreparedGeminiReviewRequest, _controls: LocalReviewerControls) => request.reviewer.thinkingBudget;
// @ts-expect-error Post-tool context preparation may choose either configured provider.
runPostToolScreenHook('input', { reviewer: geminiOnly });
// @ts-expect-error envelope mode requires both existing envelope fields
const incompleteEnvelope: PostToolScreenOptions = {
  reviewerResultFormat: 'envelope',
  reviewer: () => ({ decision: 'PASS' }),
};
// @ts-expect-error hook invocation input remains accepted as unknown; options remain structurally checked
runPostToolScreenHook({}, { cwd: 42 });
// @ts-expect-error envelope mode cannot omit the collaborator
const missingEnvelopeReviewer: PostToolScreenOptions = { reviewerResultFormat: 'envelope' };
// @ts-expect-error an asynchronously incomplete envelope remains incompatible
runPostToolScreenHook('input', { reviewerResultFormat: 'envelope', reviewer: () => Promise.resolve({ decision: 'PASS' }) });
// @ts-expect-error void callbacks do not produce the required envelope
runPostToolScreenHook('input', { reviewerResultFormat: 'envelope', reviewer: () => undefined });
void [missingDeadline, incompleteEnvelope, missingEnvelopeReviewer];
