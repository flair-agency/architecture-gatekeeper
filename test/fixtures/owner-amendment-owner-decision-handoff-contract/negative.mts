import type {
  OwnerAmendmentOwnerDecisionAuthorityChange,
  OwnerAmendmentOwnerDecisionHandoffInput,
  OwnerAmendmentOwnerDecisionHandoffResult,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-handoff.mts';
import type { OwnerAmendmentArtifactZipResult } from '../../../src/owner-amendment/owner-amendment-artifact-zip.mts';
import type { OwnerAmendmentAttestationResult } from '../../../src/owner-amendment/owner-amendment-attestation.mts';

declare const extracted: OwnerAmendmentArtifactZipResult;
declare const verified: OwnerAmendmentAttestationResult;
declare const input: OwnerAmendmentOwnerDecisionHandoffInput;
declare const result: OwnerAmendmentOwnerDecisionHandoffResult;
const readonlyChanges: readonly OwnerAmendmentOwnerDecisionAuthorityChange[] = [{ path: 'authority.md', beforeBytes: Buffer.alloc(1), afterBytes: Buffer.alloc(1) }];

const asyncExtractor: OwnerAmendmentOwnerDecisionHandoffInput['extractArtifact'] = async () => extracted;
const asyncVerifier: OwnerAmendmentOwnerDecisionHandoffInput['verifyEvidence'] = () => Promise.resolve(verified);
input.repository = 'example/repo';
readonlyChanges[0].path = 'changed.md';

function requireCompleteInput(value: OwnerAmendmentOwnerDecisionHandoffInput): OwnerAmendmentOwnerDecisionHandoffInput { return value; }
requireCompleteInput({});

if (result.status === 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK') {
  const invalidSuccessReason: string = result.reason;
  void invalidSuccessReason;
} else {
  const invalidIncompleteTagRef: string = result.tagRef;
  void invalidIncompleteTagRef;
}

void asyncExtractor;
void asyncVerifier;
const candidateShaAsString: NonNullable<OwnerAmendmentOwnerDecisionHandoffInput['fetchArtifact']> = ({ expected }) => {
  const incorrectlyTrustedSha: string = expected.baseSha;
  return { status: 'INCOMPLETE', reason: incorrectlyTrustedSha };
};
void candidateShaAsString;
