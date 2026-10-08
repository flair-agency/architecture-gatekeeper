import { validateOrdinaryOwnerDecision } from '../../../src/owner-addition/owner-addition-validation.mjs';

const decision = validateOrdinaryOwnerDecision(
  '{"decision":"OWNER_DECISION","ownerDecisionId":"choice-1","summary":"Select an owner."}',
  'choice-1',
);
const missingField: typeof decision = {
  decision: 'OWNER_DECISION',
  summary: 'Select an owner.',
};
const mistypedField: number = decision.ownerDecisionId;
void [missingField, mistypedField];
