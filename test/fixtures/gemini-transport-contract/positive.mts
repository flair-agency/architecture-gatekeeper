import {
  executeGeminiReviewer,
  prepareGeminiRequestBody,
  resolveAuthCredentials,
  runGeminiReviewer,
} from '../../../src/gemini-transport.mjs';
import type { GeminiReviewRequest, GeminiTransportOptions } from '../../../src/reviewer-transports/gemini-transport.mts';
import type { ReviewRequest } from '../../../src/review-contract/review-contract.mts';

const request: GeminiReviewRequest = {
  version: 1,
  repositoryRoot: '/repo',
  reviewedRevision: 'revision',
  task: 'review task',
  prompt: 'review prompt',
  schema: { type: 'object' },
  reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 },
  requestId: 'request-id',
};
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
const legacyRequest: GeminiReviewRequest = { ...request, reviewer: { model: 'gemini-2.5-flash', thinkingBudget: 1024 } };
void runGeminiReviewer(legacyRequest, { proxyMode: 'studio' });
void requiredTimeout;
