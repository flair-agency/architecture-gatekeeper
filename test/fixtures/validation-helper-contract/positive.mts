import * as decisionFlat from '../../../src/validate-decision.mjs';
import * as decisionPhysical from '../../../src/authority-validation/validate-decision.mts';
import * as preparedFlat from '../../../src/validate-authority-set-decision.mjs';
import * as preparedPhysical from '../../../src/authority-validation/validate-authority-set-decision.mts';
import * as schemaFlat from '../../../src/preflight-authority-set-review.mjs';
import * as schemaPhysical from '../../../src/authority-validation/preflight-authority-set-review.mts';

const decision = { decision: 'PASS' as const };
const policy: unknown = { version: 1, rules: [] };
const decisionA: typeof decision = decisionFlat.validateDecisionRules(decision, policy);
const decisionB: typeof decision = decisionPhysical.validateDecisionRules(decision, policy);
const schema = { type: 'object' as const, required: ['authorityIds'], properties: {
  authorityIds: { type: 'array' as const, items: { type: 'string' as const }, minItems: 1 },
} };
const schemaA: typeof schema = schemaFlat.validateAuthorityReviewSchema(schema);
const schemaB: typeof schema = schemaPhysical.validateAuthorityReviewSchema(schema);
const external: unknown = JSON.parse('{}');
const unknownDecision: unknown = decisionFlat.validateDecisionRules(external, policy);
const unknownSchema: unknown = schemaPhysical.validateAuthorityReviewSchema(external);
const prepared: unknown = preparedFlat.validatePreparedAuthorityDecision(external, external);
const preparedDirect: unknown = preparedPhysical.validatePreparedAuthorityDecision(external, external);
void [decisionA, decisionB, schemaA, schemaB, unknownDecision, unknownSchema, prepared, preparedDirect];
