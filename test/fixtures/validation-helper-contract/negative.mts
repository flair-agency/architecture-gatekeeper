import { validateDecisionRules as decisionFlat } from '../../../src/validate-decision.mjs';
import { validatePreparedAuthorityDecision as preparedFlat } from '../../../src/validate-authority-set-decision.mjs';
import { validateAuthorityReviewSchema as schemaPhysical } from '../../../src/authority-validation/preflight-authority-set-review.mts';

const external: unknown = JSON.parse('{}');
const decision: { decision: 'PASS' } = decisionFlat(external, { version: 1, rules: [] });
const prepared: { decision: 'PASS' } = preparedFlat(external, external);
const schema: { type: 'object'; required: ['authorityIds']; properties: object } = schemaPhysical(external);
void [decision, prepared, schema];
