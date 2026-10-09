/** Internal composition for the Issue334 per-session dispatch circuit breaker. */
import { types } from 'node:util';
import { snapshotPreparedGeminiCiReviewInput } from './prepared-gemini-ci-review.mjs';
import { snapshotPreparedReviewData } from './prepared-review-data.mjs';
import { runPreparedGeminiCiDecision } from './prepared-gemini-ci-decision.mjs';
import { createVertexVerificationReservation } from './vertex-verification-reservation.mjs';

const INPUT_KEYS = ['reviewInput', 'authorityProvenance', 'validationRules', 'maxResponseBytes', 'maxSchemaBytes'];
const CONTEXT_LIMITS = { maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 };

/**
 * Each call owns a fresh defensive dispatch counter. Runtime pin verification,
 * WIF acquisition, repository identity, producer binding and reporting remain
 * caller responsibilities; this operation does not grant an acceptance result.
 */
export async function runPreparedGeminiCiVerification(input, recordDispatch = () => true) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || types.isProxy(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('Gemini verification requires complete explicit prepared decision inputs.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== INPUT_KEYS.length || INPUT_KEYS.some(key =>
    !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
    throw new Error('Gemini verification requires complete explicit prepared decision inputs.');
  }
  const reviewInput = snapshotPreparedGeminiCiReviewInput(input.reviewInput);
  const session = reviewInput.proxySessionOptions;
  const options = session.processOptions;
  if (Object.hasOwn(session, 'reserveDispatch') || options.timeoutMs !== 180_000 ||
      options.maxOutputTokens !== 16_384 || options.maxPromptBytes !== 196_608 ||
      options.thinkingBudget !== undefined || options.model !== 'gemini-3.8-flash' || options.thinkingLevel !== 'MEDIUM') {
    throw new Error('Gemini verification settings disagree with the selected Issue334 profile.');
  }
  const limits = snapshotPreparedReviewData(session.workspaceLimits);
  if (!limits || Object.keys(limits).length !== 3 || Object.keys(CONTEXT_LIMITS).some(key =>
    !Object.hasOwn(limits, key) || !Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > CONTEXT_LIMITS[key])) {
    throw new Error('Gemini verification context exceeds the selected Issue334 bounds.');
  }
  const counter = createVertexVerificationReservation(recordDispatch);
  const result = await runPreparedGeminiCiDecision({ ...input, reviewInput: { ...reviewInput,
    proxySessionOptions: { ...session, workspaceLimits: limits, reserveDispatch: counter.reserveDispatch } } });
  return Object.freeze({ ...result, dispatchDiagnostics: counter.snapshot() });
}
