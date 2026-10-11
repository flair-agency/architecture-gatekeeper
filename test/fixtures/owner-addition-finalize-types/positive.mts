import { buildOwnerAdditionFinalRecord, type OwnerAdditionFinalRecordInput } from '../../../src/owner-addition/owner-addition-finalize.mts';
import type { OwnerAdditionAdoptionResult } from '../../../src/owner-addition/owner-addition-adoption.mts';

const member = { id: 'architecture', repository: 'flair-agency/example', resolvedCommit: 'a'.repeat(40),
  path: 'docs/architecture.md', byteLength: 4, sha256: 'b'.repeat(64) };
const coercibleArtifactDigest = { toString: () => `sha256:${'6'.repeat(64)}` };
const input: OwnerAdditionFinalRecordInput = {
  repository: 'flair-agency/example', targetBranch: 'main', pullRequestNumber: 42,
  baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), bTree: 'c'.repeat(40), authorityDigest: 'd'.repeat(64),
  policy: { version: 5 },
  selected: { mode: 'procedural', adoptionEvidenceProducer: 'github-actions',
    adoptionEvidenceWorkflowPath: '.github/workflows/gate.yml', adoptionEvidenceJobName: 'Gate / owner-addition' },
  policySha256: 'e'.repeat(64), policyPath: '.codex/policy.json',
  procedure: { status: 'verified', digest: 'f'.repeat(64), repository: 'flair-agency/example',
    baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), targetBranch: 'main', pullRequestNumber: 42,
    tagTargetSha: 'b'.repeat(40), tagObjectOid: '1'.repeat(40), ownerDecisionId: 'decision-42',
    authoritySetDigest: '2'.repeat(64), authorityIds: ['architecture'], authorityId: 'architecture',
    authorityPath: 'docs/architecture.md', tagRef: 'refs/tags/example', additionRecordSha256: '3'.repeat(64),
    missingDecisionId: 'decision-42' },
  ordinaryDecision: { status: 'verified' }, authoritySet: { ids: ['architecture'], digest: '2'.repeat(64) },
  eligibility: { result: 'eligible', digest: '4'.repeat(64) },
  authoritySetProvenance: { version: 2, selfRepository: 'flair-agency/example', authorityRevision: 'a'.repeat(40),
    manifestSha256: '5'.repeat(64), setDigest: '2'.repeat(64), members: [member] },
  eligibilityEvidence: { status: 'verified' },
  eligibilityArtifactBinding: { checkRunId: 100, artifactId: 200, artifactDigest: coercibleArtifactDigest,
    annotationTitle: 'AGK_OWNER_ADDITION_ARTIFACT_V1', annotationMessage: 'artifact identity' },
  merge: { commit: { sha: '7'.repeat(40), parents: ['a'.repeat(40), 'b'.repeat(40)], tree: 'c'.repeat(40) },
    hostMetadata: { mergedAt: '2026-09-26T02:00:00.000Z' } },
  targetReadback: { targetRef: 'refs/heads/main', targetSha: '8'.repeat(40), authorityDigest: 'd'.repeat(64) },
  identities: {}, generatedAt: 0,
};
const result = buildOwnerAdditionFinalRecord(input);
const version: 1 = result.version;
const adoption: OwnerAdditionAdoptionResult['adoption'] = result.outcome.adoption;
const canonical: OwnerAdditionAdoptionResult['canonical'] = result.outcome.canonical;
const copiedPolicyVersion: unknown = result.selectedPolicy.version;
// @ts-expect-error The serialized policy field is a copied observation, not a validated string.
const claimedPolicyVersion: string = result.selectedPolicy.version;
if (input.eligibilityArtifactBinding) {
  const copiedCheckRunId: unknown = input.eligibilityArtifactBinding.checkRunId;
  // @ts-expect-error Regex.test coercion does not validate the reread field as a string.
  const claimedCheckRunId: string = input.eligibilityArtifactBinding.checkRunId;
  void [copiedCheckRunId, claimedCheckRunId];
}
const copiedGeneratedAt: unknown = input.generatedAt;
// @ts-expect-error Date.parse coercion does not make the public input a string.
const claimedGeneratedAt: string = input.generatedAt;
void version;
void adoption;
void canonical;
void copiedPolicyVersion;
void claimedPolicyVersion;
void [copiedGeneratedAt, claimedGeneratedAt];
