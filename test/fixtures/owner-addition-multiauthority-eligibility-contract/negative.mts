import { validateMultiAuthorityEligibility } from '../../../src/owner-addition-multiauthority.mts';

declare const rawDecisionJson: unknown;
declare const selectedSchema: unknown;
declare const selectedProvenance: unknown;

// All three existing validator inputs are required.
validateMultiAuthorityEligibility(rawDecisionJson, selectedSchema);

const observed = validateMultiAuthorityEligibility(rawDecisionJson, selectedSchema, selectedProvenance);
// External parsed eligibility remains unknown; validation is not an authentication or acceptance claim.
const falselyEligible: { eligible: true; authorityIds: string[]; authoritySetDigest: string } = observed;
void falselyEligible;
