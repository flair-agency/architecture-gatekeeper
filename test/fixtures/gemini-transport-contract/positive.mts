import {
executeGeminiReviewer,
prepareGeminiRequestBody,
  resolveAuthCredentials,
runGeminiReviewer,
} from '../../../src/gemini-transport.mts';
import type { GeminiReviewRequest, GeminiTransportOptions } from '../../../src/reviewer-transports/gemini-transport.mts';
import type { GeminiReviewerSettings, ReviewRequest } from '../../../src/review-contract/review-contract.mts';

const request = {
  version: 1,
  repositoryRoot: '/repo',
  reviewedRevision: 'revision',
  task: 'review task',
  prompt: 'review prompt',
  schema: { type: 'object' },
  reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 },
  requestId: 'request-id',
} satisfies GeminiReviewRequest;
const response = { ok: true, status: 200, json: () => ({ candidates: [] }) };
const syncTransport: NonNullable<GeminiTransportOptions['fetch']> = () => response;
const asyncTransport: NonNullable<GeminiTransportOptions['fetch']> = async () => response;
const thenableTransport: NonNullable<GeminiTransportOptions['fetch']> = () => ({
  then<TResult1 = typeof response, TResult2 = never>(
    onfulfilled?: ((value: typeof response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(response).then(onfulfilled, onrejected);
  },
});
const standardFetch: NonNullable<GeminiTransportOptions['fetch']> = globalThis.fetch;
const syncJson = () => ({ ok: true, status: 200, json: () => ({ candidates: [] }) });
const asyncJson = () => ({ ok: true, status: 200, json: async () => ({ candidates: [] }) });
const thenableJson = () => ({
  ok: true,
  status: 200,
  json: () => ({ then: (resolve: (value: unknown) => unknown) => resolve({ candidates: [] }) }),
});
const syncJsonTransport: NonNullable<GeminiTransportOptions['fetch']> = () => syncJson();
const asyncJsonTransport: NonNullable<GeminiTransportOptions['fetch']> = () => asyncJson();
const thenableJsonTransport: NonNullable<GeminiTransportOptions['fetch']> = () => thenableJson();
const syncResult: Promise<unknown> = runGeminiReviewer(request, { apiKey: 'fixture-key', fetch: syncTransport });
const asyncResult: Promise<{ decision: unknown; execution: unknown }> = executeGeminiReviewer(request, { apiKey: 'fixture-key', fetch: asyncTransport });
const thenableResult: Promise<unknown> = runGeminiReviewer(request, { apiKey: 'fixture-key', fetch: thenableTransport });
const standardResult: Promise<unknown> = runGeminiReviewer(request, { apiKey: 'fixture-key', fetch: standardFetch });
const syncJsonResult: Promise<unknown> = runGeminiReviewer(request, { apiKey: 'fixture-key', fetch: syncJsonTransport });
const asyncJsonResult: Promise<unknown> = runGeminiReviewer(request, { apiKey: 'fixture-key', fetch: asyncJsonTransport });
const thenableJsonResult: Promise<unknown> = runGeminiReviewer(request, { apiKey: 'fixture-key', fetch: thenableJsonTransport });
const body: Record<string, unknown> = prepareGeminiRequestBody(request);
const credentials = resolveAuthCredentials({ resolveGcloudAccessToken: () => 'fixture-token' });
void [syncResult, asyncResult, thenableResult, standardResult, syncJsonResult, asyncJsonResult, thenableJsonResult, body, credentials];

const requiredTimeout = resolveAuthCredentials({ resolveGcloudAccessToken: (timeoutMs: number) => String(timeoutMs) });
const legacyEffortRequest = { ...request, reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' } } satisfies GeminiReviewRequest;
const legacyOptionsBudgetRequest = { ...request, reviewer: { model: 'gemini-2.5-flash' } } satisfies GeminiReviewRequest;
void runGeminiReviewer(legacyEffortRequest, { proxyMode: 'studio' });
void runGeminiReviewer(legacyOptionsBudgetRequest, { proxyMode: 'studio', thinkingBudget: 1024 });
const v2Request = { ...request, version: 2, authoritySet: {}, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 } } satisfies GeminiReviewRequest;
declare const externalThinkingBudget: unknown;
const externalBudgetGeminiRequest = { ...request, reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: externalThinkingBudget } } satisfies GeminiReviewRequest;
declare const publicGeminiSettings: GeminiReviewerSettings;
const publicSettingsRequest = { ...request, reviewer: publicGeminiSettings } satisfies GeminiReviewRequest;
const legacyRequestThinkingBudget = { ...request, reviewer: { model: 'gemini-2.5-flash', thinkingBudget: externalThinkingBudget } } satisfies GeminiReviewRequest;
void runGeminiReviewer(v2Request);
void runGeminiReviewer(legacyRequestThinkingBudget, { thinkingBudget: 1024 });
void [externalBudgetGeminiRequest, publicSettingsRequest];
void requiredTimeout;

prepareGeminiRequestBody(request);
prepareGeminiRequestBody(publicSettingsRequest);
prepareGeminiRequestBody(externalBudgetGeminiRequest, { thinkingBudget: externalThinkingBudget });
prepareGeminiRequestBody(legacyEffortRequest);
prepareGeminiRequestBody(legacyEffortRequest, { reasoningEffort: 'low' });
prepareGeminiRequestBody(legacyOptionsBudgetRequest, { thinkingBudget: externalThinkingBudget });
prepareGeminiRequestBody(legacyRequestThinkingBudget, { thinkingBudget: externalThinkingBudget });
prepareGeminiRequestBody(v2Request);
executeGeminiReviewer(request);
executeGeminiReviewer(publicSettingsRequest);
executeGeminiReviewer(externalBudgetGeminiRequest, { thinkingBudget: externalThinkingBudget });
executeGeminiReviewer(legacyEffortRequest);
executeGeminiReviewer(legacyEffortRequest, { reasoningEffort: 'low' });
executeGeminiReviewer(legacyOptionsBudgetRequest, { thinkingBudget: externalThinkingBudget });
executeGeminiReviewer(legacyRequestThinkingBudget, { thinkingBudget: externalThinkingBudget });
executeGeminiReviewer(v2Request);
runGeminiReviewer(request);
runGeminiReviewer(publicSettingsRequest);
runGeminiReviewer(externalBudgetGeminiRequest, { thinkingBudget: externalThinkingBudget });
runGeminiReviewer(legacyEffortRequest);
runGeminiReviewer(legacyEffortRequest, { reasoningEffort: 'low' });
runGeminiReviewer(legacyOptionsBudgetRequest, { thinkingBudget: externalThinkingBudget });
runGeminiReviewer(legacyRequestThinkingBudget, { thinkingBudget: externalThinkingBudget });
runGeminiReviewer(v2Request);
