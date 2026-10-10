import { verifyOwnerAmendmentBlockEvidenceBundle } from '../../../src/owner-amendment/owner-amendment-block-evidence-composer.mts';

declare const input: Parameters<typeof verifyOwnerAmendmentBlockEvidenceBundle>[0];
const result = verifyOwnerAmendmentBlockEvidenceBundle(input);
if (result.status === 'INCOMPLETE') {
  result.reviewRecordSha256;
}
