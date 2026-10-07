/** Internal composition for the owner-selected Issue334 verification allocation only. */
import { types } from 'node:util';
import { snapshotPreparedGeminiCiReviewInput } from './prepared-gemini-ci-review.mjs';
import { snapshotPreparedReviewData } from './prepared-review-data.mjs';
import { runPreparedGeminiCiDecision } from './prepared-gemini-ci-decision.mjs';
import { createVertexVerificationReservation } from './vertex-verification-reservation.mjs';

const INPUT_KEYS = ['reviewInput', 'authorityProvenance', 'validationRules', 'maxResponseBytes', 'maxSchemaBytes'];
const CONTEXT_LIMITS = { maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 };

/**
 * The trusted verification launcher supplies protected prepared inputs and the
 * same exclusively held private allocation fd across sessions. It owns fresh
 * allocation/retention and closes the fd only after this operation settles.
 * Runtime pin verification, WIF acquisition, repository identity, producer
 * binding and reporting/acceptance remain caller responsibilities. This internal
 * operation does not activate ordinary CI or grant an acceptance result.
 */
export async function runPreparedGeminiCiVerification(input, reservationFd) {
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
      options.maxOutputTokens !== 16_384 || options.maxPromptBytes !== 131_072 ||
      options.thinkingBudget !== undefined || options.model !== 'gemini-3.8-flash' || options.thinkingLevel !== 'MEDIUM') {
    throw new Error('Gemini verification settings disagree with the selected Issue334 profile.');
  }
  const limits = snapshotPreparedReviewData(session.workspaceLimits);
  if (!limits || Object.keys(limits).length !== 3 || Object.keys(CONTEXT_LIMITS).some(key =>
    !Object.hasOwn(limits, key) || !Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > CONTEXT_LIMITS[key])) {
    throw new Error('Gemini verification context exceeds the selected Issue334 bounds.');
  }
  // A missing, empty, corrupt or inaccessible ledger fails before proxy/CLI
  // startup. This composition never initializes or resets an allocation.
  const reserveDispatch = createVertexVerificationReservation(reservationFd);
  return runPreparedGeminiCiDecision({ ...input, reviewInput: { ...reviewInput,
    proxySessionOptions: { ...session, workspaceLimits: limits, reserveDispatch } } });
}
