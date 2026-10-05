/** Internal shared completion boundary; no provider dispatch or acceptance authority. */
import { normalizeCiExecutionResult } from './ci-execution-result.mjs';
import { validatePreparedCiDecision } from './prepared-ci-decision.mjs';

const KEYS = ['executionInput', 'schemaBytes', 'authorityProvenance', 'validationRules', 'maxSchemaBytes'];

/**
 * The protected caller owns selection and revision bindings. Host failure or
 * unavailable bounded response material remains incomplete, even if a provider
 * produced a PASS. A completed execution must pass the same schema, complete
 * authority and consumer-rule checks regardless of its selected provider.
 * This in-memory result is neither authenticated evidence nor merge acceptance.
 */
export function completePreparedCiReview(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(input, key))) {
    throw new Error('Prepared CI completion requires the complete explicit input set.');
  }
  const execution = normalizeCiExecutionResult(input.executionInput);
  if (execution.status !== 'completed') return { execution };
  const decision = validatePreparedCiDecision({
    responseBytes: execution.responseBytes,
    schemaBytes: input.schemaBytes,
    authorityProvenance: input.authorityProvenance,
    validationRules: input.validationRules,
    maxResponseBytes: input.executionInput.maxResponseBytes,
    maxSchemaBytes: input.maxSchemaBytes,
  });
  return { execution, decision };
}
