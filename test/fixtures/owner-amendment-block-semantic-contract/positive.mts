import { validateOwnerAmendmentBlockSemanticRecord as fromFlat } from '../../../src/owner-amendment-block-semantic-record.mjs';
import { validateOwnerAmendmentBlockSemanticRecord as fromImplementation } from '../../../src/owner-amendment/owner-amendment-block-semantic-record.mts';
import type { OwnerAmendmentBlockSemanticRecordInput } from '../../../src/owner-amendment/owner-amendment-block-semantic-record.mts';

const input: OwnerAmendmentBlockSemanticRecordInput = {
  bytes: unknownValue,
  expected: { changes: unknownValue, triggerReviewRecordSha256: unknownValue, authoritySetDigest: unknownValue },
  repository: unknownValue,
  baseSha: unknownValue,
  bSha: unknownValue,
  triggerProfile: unknownValue,
  authority: { authorityId: unknownValue, authorityPath: unknownValue,
    previousSha256: unknownValue, newSha256: unknownValue },
  attestationBundleSha256: unknownValue,
  resultingAuthoritySetDigest: unknownValue,
};
declare const unknownValue: unknown;

const flatResult = fromFlat(input);
const implementationResult = fromImplementation(input);
const status: 'VERIFIED_OWNER_AMENDMENT_RECORD' = flatResult.status;
const targetValidated: true = implementationResult.targetValidated;
const copiedBinding: unknown = flatResult.repository;
const copiedPurpose: unknown = implementationResult.purpose;
void [status, targetValidated, copiedBinding, copiedPurpose];
