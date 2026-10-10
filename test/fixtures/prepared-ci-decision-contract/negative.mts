import { validatePreparedCiDecision } from '../../../src/prepared-ci-decision.mjs';
import type { PreparedCiDecisionInput } from '../../../src/ci-review/prepared-ci-decision.mts';

declare const external: unknown;
const decision = validatePreparedCiDecision(external);
const trusted: { approved: true } = decision;
const badBytes: PreparedCiDecisionInput['responseBytes'] = 1;
const missingRules: PreparedCiDecisionInput = { responseBytes: '{}', schemaBytes: '{}', authorityProvenance: null, maxResponseBytes: 1, maxSchemaBytes: 1 };
const extra: PreparedCiDecisionInput = { responseBytes: '{}', schemaBytes: '{}', authorityProvenance: null, validationRules: {}, maxResponseBytes: 1, maxSchemaBytes: 1, accepted: true };
validatePreparedCiDecision({}, {});
const accepted: { accepted: true } = decision;
void [trusted, badBytes, missingRules, extra, accepted];
