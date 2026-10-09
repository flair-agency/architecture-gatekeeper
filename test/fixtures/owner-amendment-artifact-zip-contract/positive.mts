import {
  extractOwnerAmendmentArtifactZip,
  extractOwnerAmendmentBlockArtifactZip,
  type OwnerAmendmentArtifactZipResult,
} from '../../../src/owner-amendment/owner-amendment-artifact-zip.mjs';

const externalBytes: unknown = Buffer.alloc(0);
const extracted = extractOwnerAmendmentArtifactZip(externalBytes, { profile: 'eligibility' });
const arbitraryProfile = extractOwnerAmendmentArtifactZip(externalBytes, { profile: 42 });
const block = extractOwnerAmendmentBlockArtifactZip(new Uint8Array());
const acceptedResult: OwnerAmendmentArtifactZipResult = block;

if (extracted.status === 'EXTRACTED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT') {
  extracted.eligibilityReceiptBytes.byteLength;
  extracted.attestationBundleBytes.byteLength;
}
if (arbitraryProfile.status === 'INCOMPLETE') {
  const externalMessage: unknown = arbitraryProfile.reason;
  void externalMessage;
}
if (acceptedResult.status === 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT') {
  acceptedResult.reviewRecordBytes[0] = 0;
  acceptedResult.attestationBundleBytes.byteLength;
}
