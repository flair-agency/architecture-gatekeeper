import {
  validateOrdinaryOwnerDecision,
  validateOwnerAdditionEligibility,
  validateOwnerAdditionEligibilitySchema,
} from '../../../src/owner-addition/owner-addition-validation.mjs';

const schema: unknown = JSON.parse('{}');
validateOwnerAdditionEligibilitySchema(schema);
const eligibility = validateOwnerAdditionEligibility('{}', schema);
const established: true = eligibility.eligible;
const explanation: string = eligibility.summary;

const ordinary = validateOrdinaryOwnerDecision(
  '{"decision":"OWNER_DECISION","ownerDecisionId":"choice-1","summary":"Select an owner."}',
  'choice-1',
);
const exactDecision: 'OWNER_DECISION' = ordinary.decision;
const selectedId: string = ordinary.ownerDecisionId;
void [established, explanation, exactDecision, selectedId];
