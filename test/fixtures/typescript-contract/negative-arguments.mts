import { validateOrdinaryOwnerDecision } from '../../../src/owner-addition/owner-addition-validation.mts';

validateOrdinaryOwnerDecision(42, 'choice-1');
validateOrdinaryOwnerDecision('{"decision":"OWNER_DECISION"}', 42);
