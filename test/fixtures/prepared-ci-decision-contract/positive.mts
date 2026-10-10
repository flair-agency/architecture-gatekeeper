import { validatePreparedCiDecision } from '../../../src/prepared-ci-decision.mjs';
import type { PreparedCiDecisionInput } from '../../../src/ci-review/prepared-ci-decision.mts';

const input: PreparedCiDecisionInput = {
  responseBytes: Buffer.from('{}'), schemaBytes: '{"type":"object"}',
  authorityProvenance: null, validationRules: null, maxResponseBytes: 65_536, maxSchemaBytes: 1_048_576,
};
declare const external: unknown;
const decision: unknown = validatePreparedCiDecision(external);
void [input, decision];
