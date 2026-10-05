/** Internal orchestration; protected input production and acceptance remain external. */
import { types } from 'node:util';
import { runPreparedGeminiCiReview } from './prepared-gemini-ci-review.mjs';
import { completePreparedCiReview } from './complete-prepared-ci-review.mjs';

const KEYS = ['reviewInput', 'authorityProvenance', 'validationRules', 'maxResponseBytes', 'maxSchemaBytes'];

/**
 * Connect one caller-prepared Gemini execution to shared completion validation.
 * The caller must bind policy, revisions, schema, authority and rules before
 * calling. Applied settings below are expected configuration, not authenticated
 * backend identity or portable evidence. Failures propagate without a decision
 * or provider fallback; this operation grants no reporting/acceptance authority.
 */
export async function runPreparedGeminiCiDecision(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || types.isProxy(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
      Reflect.ownKeys(Object.getOwnPropertyDescriptors(input)).some(key => typeof key !== 'string' ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value')) ||
      Object.keys(input).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(input, key))) {
    throw new Error('Prepared Gemini CI decision requires the complete explicit input set.');
  }
  if (!Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes < 1 || input.maxResponseBytes > 65_536 ||
      !Number.isSafeInteger(input.maxSchemaBytes) || input.maxSchemaBytes < 1 || input.maxSchemaBytes > 1_048_576) {
    throw new Error('Prepared Gemini CI decision requires explicit bounds within the shared response/schema ceilings.');
  }
  // Capture caller-owned completion materials before the asynchronous session.
  // These private copies cannot be replaced or mutated by the caller while the
  // CLI runs. Structured cloning also rejects executable/non-data inputs.
  const { maxResponseBytes, maxSchemaBytes } = input;
  const authorityProvenance = structuredClone(input.authorityProvenance);
  const validationRules = structuredClone(input.validationRules);
  if (!authorityProvenance || typeof authorityProvenance !== 'object' || Array.isArray(authorityProvenance) ||
      (validationRules !== null && (!validationRules || typeof validationRules !== 'object' || Array.isArray(validationRules)))) {
    throw new Error('Prepared Gemini CI decision requires explicit authority and validation data.');
  }
  const { reviewInput } = input;
  const options = reviewInput?.proxySessionOptions?.processOptions;
  if (!options || typeof reviewInput.protectedDecisionSchemaText !== 'string') {
    throw new Error('Prepared Gemini CI decision requires explicit prepared execution inputs.');
  }
  const schemaBytes = Buffer.from(reviewInput.protectedDecisionSchemaText, 'utf8');
  if (schemaBytes.length === 0 || schemaBytes.length > maxSchemaBytes) {
    throw new Error('Prepared Gemini CI decision schema exceeds its selected byte bound.');
  }
  const expectedExecution = {
    provider: reviewInput.protectedReviewer?.provider,
    requestedModel: options.model,
    requestedSettings: {
      thinkingLevel: options.thinkingLevel,
      ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}),
      timeoutMs: options.timeoutMs,
      maxPromptBytes: options.maxPromptBytes,
      maxStdoutBytes: options.maxStdoutBytes,
      maxStderrBytes: options.maxStderrBytes,
    },
  };
  const rawResponse = await runPreparedGeminiCiReview(reviewInput);
  return completePreparedCiReview({
    executionInput: { expectedExecution, hostStepOutcome: 'success', rawResponse, maxResponseBytes },
    schemaBytes,
    authorityProvenance,
    validationRules,
    maxSchemaBytes,
  });
}
