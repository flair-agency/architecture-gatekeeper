import { executeGeminiReviewer, prepareGeminiRequestBody, resolveAuthCredentials, runGeminiReviewer } from '../../../src/gemini-transport.mts';
import type { GeminiReviewRequest } from '../../../src/reviewer-transports/gemini-transport.mts';
import type { ReviewRequest } from '../../../src/review-contract/review-contract.mts';

declare const request: GeminiReviewRequest & { reviewer: { provider: 'gemini'; model: string; thinkingBudget: unknown; reasoningEffort?: never } };
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

declare const codexRequest: ReviewRequest & { reviewer: { provider: 'codex' } };
// @ts-expect-error Explicit Codex requests are unsupported by the Gemini transport.
runGeminiReviewer(codexRequest);
// @ts-expect-error Body preparation also requires Gemini or providerless legacy settings.
prepareGeminiRequestBody(codexRequest);
// @ts-expect-error Execution does not accept an explicit Codex provider.
executeGeminiReviewer(codexRequest);
// @ts-expect-error Active proxy mode must be one of the original validated modes.
runGeminiReviewer(request, { proxyUrl: 'http://localhost:1234', proxyMode: 'studoi' });

// @ts-expect-error An explicit Gemini route requires a thinkingBudget property.
const missingBudget: GeminiReviewRequest = { ...request, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash' } };
// @ts-expect-error An explicit Gemini route cannot use the legacy effort setting.
const mixedGeminiSettings: GeminiReviewRequest = { ...request, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024, reasoningEffort: 'low' } };
void [missingBudget, mixedGeminiSettings];

// Actual request/options composition must reject every public route consistently.
const noEffort = { ...request, reviewer: { model: 'gemini-2.5-flash' } };
const ownBudgetOnly = { ...request, reviewer: { model: 'gemini-2.5-flash', thinkingBudget: 1024 } };
const effort = { ...request, reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' as const } };
// @ts-expect-error Providerless fallback requires an options budget property.
prepareGeminiRequestBody(noEffort);
// @ts-expect-error A reviewer-only budget does not activate the fallback.
prepareGeminiRequestBody(ownBudgetOnly);
// @ts-expect-error Explicit Gemini rejects effort options.
prepareGeminiRequestBody(request, { reasoningEffort: 'low' });
// @ts-expect-error Legacy effort rejects budget options.
prepareGeminiRequestBody(effort, { thinkingBudget: 1024 });
// @ts-expect-error Fallback options cannot own both thinking controls.
prepareGeminiRequestBody(noEffort, { thinkingBudget: 1024, reasoningEffort: 'low' });
// @ts-expect-error Providerless fallback requires an options budget property.
executeGeminiReviewer(noEffort);
// @ts-expect-error A reviewer-only budget does not activate the fallback.
executeGeminiReviewer(ownBudgetOnly);
// @ts-expect-error Explicit Gemini rejects effort options.
executeGeminiReviewer(request, { reasoningEffort: 'low' });
// @ts-expect-error Legacy effort rejects budget options.
executeGeminiReviewer(effort, { thinkingBudget: 1024 });
// @ts-expect-error Fallback options cannot own both thinking controls.
executeGeminiReviewer(noEffort, { thinkingBudget: 1024, reasoningEffort: 'low' });
// @ts-expect-error Providerless fallback requires an options budget property.
runGeminiReviewer(noEffort);
// @ts-expect-error A reviewer-only budget does not activate the fallback.
runGeminiReviewer(ownBudgetOnly);
// @ts-expect-error Explicit Gemini rejects effort options.
runGeminiReviewer(request, { reasoningEffort: 'low' });
// @ts-expect-error Legacy effort rejects budget options.
runGeminiReviewer(effort, { thinkingBudget: 1024 });
// @ts-expect-error Fallback options cannot own both thinking controls.
runGeminiReviewer(noEffort, { thinkingBudget: 1024, reasoningEffort: 'low' });
// @ts-expect-error Options themselves cannot advertise mixed controls.
const mixedOptions: import('../../../src/reviewer-transports/gemini-transport.mts').GeminiTransportOptions = { reasoningEffort: 'low', thinkingBudget: 1024 };
void mixedOptions;
