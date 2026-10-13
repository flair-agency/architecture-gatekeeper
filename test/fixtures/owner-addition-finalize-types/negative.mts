import { buildOwnerAdditionFinalRecord, type OwnerAdditionFinalRecordInput } from '../../../src/owner-addition/owner-addition-finalize.mts';

// The existing function destructures these input fields.
buildOwnerAdditionFinalRecord({});

declare const input: OwnerAdditionFinalRecordInput;
// Copied policy observations are not authenticated strings.
const policyVersion: string = input.policy.version;
if (input.eligibilityArtifactBinding) {
  // Artifact identifier validation preserves RegExp.test coercion.
  const checkRunId: string = input.eligibilityArtifactBinding.checkRunId;
  // Artifact digest validation preserves RegExp.test coercion.
  const artifactDigest: string = input.eligibilityArtifactBinding.artifactDigest;
  void [checkRunId, artifactDigest];
}
// generatedAt is passed to Date.parse with its original coercion.
const generatedAt: string = input.generatedAt;
void [policyVersion, generatedAt];
