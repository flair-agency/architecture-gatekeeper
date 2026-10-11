import { buildOwnerAdditionFinalRecord, type OwnerAdditionFinalRecordInput } from '../../../src/owner-addition/owner-addition-finalize.mts';

// @ts-expect-error The existing function destructures these input fields.
buildOwnerAdditionFinalRecord({});

declare const input: OwnerAdditionFinalRecordInput;
// @ts-expect-error Copied policy observations are not authenticated strings.
const policyVersion: string = input.policy.version;
if (input.eligibilityArtifactBinding) {
  // @ts-expect-error Artifact identifier validation preserves RegExp.test coercion.
  const checkRunId: string = input.eligibilityArtifactBinding.checkRunId;
  // @ts-expect-error Artifact digest validation preserves RegExp.test coercion.
  const artifactDigest: string = input.eligibilityArtifactBinding.artifactDigest;
  void [checkRunId, artifactDigest];
}
// @ts-expect-error generatedAt is passed to Date.parse with its original coercion.
const generatedAt: string = input.generatedAt;
void [policyVersion, generatedAt];
