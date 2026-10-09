import { extractOwnerAmendmentArtifactZip, type OwnerAmendmentArtifactZipResult } from '../../../src/owner-amendment/owner-amendment-artifact-zip.mjs';

const result = extractOwnerAmendmentArtifactZip(Buffer.alloc(0));
const narrowedReason: string = result.reason;
const staleEligibilityBytes = result.eligibilityReceiptBytes;
if (result.status === 'INCOMPLETE') {
  const forbiddenBytes = result.reviewRecordBytes;
  void forbiddenBytes;
}
if (result.status === 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT') {
  const missingEligibilityBytes: Buffer = result.eligibilityReceiptBytes;
  void missingEligibilityBytes;
}
const contradictory = { status: 'INCOMPLETE' as const, reason: 'bad', reviewRecordBytes: Buffer.alloc(0) };
const staleNonFresh: OwnerAmendmentArtifactZipResult = contradictory;
void [narrowedReason, staleEligibilityBytes, staleNonFresh];
