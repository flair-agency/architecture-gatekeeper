import { executeGeminiReviewer, resolveAuthCredentials, runGeminiReviewer } from '../../../src/gemini-transport.mjs';
import type { ReviewRequest } from '../../../src/review-contract/review-contract.mts';

declare const request: ReviewRequest;
// @ts-expect-error Runtime does not await gcloud-token callbacks, so the resolver remains synchronous.
resolveAuthCredentials({ resolveGcloudAccessToken: async () => 'token' });
// @ts-expect-error A transport request requires the existing reviewer request fields.
runGeminiReviewer({ prompt: 'review', schema: {} });
// @ts-expect-error Parsed provider decisions remain unknown after awaiting the transport.
const decision: string = await runGeminiReviewer(request);
const execution = await executeGeminiReviewer(request);
// @ts-expect-error The execution envelope also leaves its decision unknown.
const envelopeDecision: string = execution.decision;
void [decision, envelopeDecision];
