/** Internal composition for the adopted ordinary Gemini session profile. */
import { types } from 'node:util';
import { snapshotPreparedGeminiCiReviewInput } from './prepared-gemini-ci-review.mts';
import { snapshotPreparedReviewData } from './prepared-review-data.mts';
import { runPreparedGeminiCiDecision } from './prepared-gemini-ci-decision.mts';
import { createVertexVerificationReservation } from './vertex-verification-reservation.mts';
import type { ReviewFileContextLimits } from './review-inputs/prepare-review-file-context.mts';

const INPUT_KEYS = ['reviewInput', 'authorityProvenance', 'validationRules', 'maxResponseBytes', 'maxSchemaBytes'];
const CONTEXT_LIMITS = { maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 };
export interface PreparedGeminiCiProfileDecisionInput { reviewInput: unknown; authorityProvenance: unknown; validationRules: unknown; maxResponseBytes: number; maxSchemaBytes: number }
export type GeminiDispatchRecorder = (attempt: number) => boolean;

/**
 * Run one prepared Gemini decision under the fixed ordinary session profile.
 * Runtime pin verification, WIF acquisition, repository identity, producer
 * binding and reporting remain caller responsibilities. The ten-dispatch
 * counter is a session circuit breaker, not a cross-session allocation or an
 * acceptance decision.
 */
export async function runPreparedGeminiCiProfileDecision(input: PreparedGeminiCiProfileDecisionInput, recordDispatch: GeminiDispatchRecorder = () => true) {
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
      options.maxStdoutBytes !== 65_536 || options.maxStderrBytes !== 65_536 ||
      options.thinkingBudget !== undefined || options.model !== 'gemini-3.8-flash' ||
      options.thinkingLevel !== 'MEDIUM' || options.region !== 'global') {
    throw new Error('Gemini verification settings disagree with the selected Issue334 profile.');
  }
  const limitsData = snapshotPreparedReviewData(session.workspaceLimits);
  if (!limitsData || typeof limitsData !== 'object' || Array.isArray(limitsData) || Object.keys(limitsData).length !== 3 ||
      !Object.hasOwn(limitsData, 'maxFiles') || !Object.hasOwn(limitsData, 'maxFileBytes') || !Object.hasOwn(limitsData, 'maxTotalBytes') ||
      !Number.isSafeInteger(limitsData.maxFiles) || (limitsData.maxFiles as number) < 1 || (limitsData.maxFiles as number) > CONTEXT_LIMITS.maxFiles ||
      !Number.isSafeInteger(limitsData.maxFileBytes) || (limitsData.maxFileBytes as number) < 1 || (limitsData.maxFileBytes as number) > CONTEXT_LIMITS.maxFileBytes ||
      !Number.isSafeInteger(limitsData.maxTotalBytes) || (limitsData.maxTotalBytes as number) < 1 || (limitsData.maxTotalBytes as number) > CONTEXT_LIMITS.maxTotalBytes) {
    throw new Error('Gemini verification context exceeds the selected Issue334 bounds.');
  }
  const limits: ReviewFileContextLimits = { maxFiles: limitsData.maxFiles as number, maxFileBytes: limitsData.maxFileBytes as number, maxTotalBytes: limitsData.maxTotalBytes as number };
  const counter = createVertexVerificationReservation(recordDispatch);
  const result = await runPreparedGeminiCiDecision({ ...input, reviewInput: { ...reviewInput,
    proxySessionOptions: { ...session, workspaceLimits: limits, reserveDispatch: counter.reserveDispatch } } });
  return Object.freeze({ ...result, dispatchDiagnostics: counter.snapshot() });
}
