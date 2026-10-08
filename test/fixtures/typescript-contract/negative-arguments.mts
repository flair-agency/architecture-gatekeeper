import { validateOrdinaryOwnerDecision } from '../../../src-ts/owner-addition/owner-addition-validation.mjs';

validateOrdinaryOwnerDecision(42, 'choice-1');
validateOrdinaryOwnerDecision('{"decision":"OWNER_DECISION"}', 42);
