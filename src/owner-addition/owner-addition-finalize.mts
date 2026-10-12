import { evaluateOwnerAdditionAdoption, type OwnerAdditionAdoptionResult } from './owner-addition-adoption.mts';
import { validateMultiAuthorityProvenance } from '../authority-validation/multi-authority-provenance.mts';

type UnknownRecord = Record<string, unknown>;
type IterableWithIndex = Iterable<unknown> & { length: unknown; [index: number]: unknown };
type MemberCollection = {
  length: number;
  some(callback: (member: UnknownRecord, index: number) => unknown): unknown;
  map(callback: (member: UnknownRecord, index: number) => unknown): unknown;
};
type ProcedureInput = UnknownRecord & {
  status: unknown; digest: unknown; repository: unknown; baseSha: unknown; bSha: unknown;
  targetBranch: unknown; pullRequestNumber: unknown; tagTargetSha: unknown; tagObjectOid: unknown;
  ownerDecisionId: unknown; authoritySetDigest: unknown; authorityIds: unknown;
  authorityId: unknown; authorityPath: unknown; tagRef: unknown; additionRecordSha256: unknown;
  missingDecisionId: unknown;
};
type SelectedPolicyInput = UnknownRecord & {
  mode: unknown; adoptionEvidenceProducer: unknown; adoptionEvidenceWorkflowPath: unknown;
  adoptionEvidenceJobName: unknown;
};
type FinalRecordIdentityInput = UnknownRecord;
export type OwnerAdditionFinalRecordInput = {
  repository: unknown;
  targetBranch: unknown;
  pullRequestNumber: unknown;
  baseSha: unknown;
  bSha: unknown;
  bTree: unknown;
  authorityDigest: unknown;
  policy: UnknownRecord & { version: unknown };
  selected: SelectedPolicyInput;
  policySha256: unknown;
  policyPath: unknown;
  procedure: ProcedureInput;
  ordinaryDecision: unknown;
  authoritySet: UnknownRecord & { ids: IterableWithIndex; digest: unknown };
  eligibility: UnknownRecord & { result: unknown; digest: unknown };
  authoritySetProvenance: UnknownRecord & {
    selfRepository: unknown; authorityRevision: unknown; setDigest: unknown; members: MemberCollection;
    manifestSha256: unknown;
  };
  eligibilityEvidence: unknown;
  eligibilityArtifactBinding: (UnknownRecord & {
    checkRunId: unknown; artifactId: unknown; artifactDigest: unknown;
    annotationTitle: unknown; annotationMessage: unknown;
  }) | null | undefined;
  merge: UnknownRecord & {
    commit: UnknownRecord & { sha: unknown; parents: Iterable<unknown>; tree: unknown };
    hostMetadata: UnknownRecord & { mergedAt: unknown };
  };
  targetReadback: UnknownRecord & { targetRef: unknown; targetSha: unknown; authorityDigest: unknown };
  identities?: FinalRecordIdentityInput;
  generatedAt?: unknown;
};
export type OwnerAdditionFinalRecord = {
  version: 1;
  generatedAt: string;
  candidate: UnknownRecord;
  selectedPolicy: UnknownRecord;
  authoritySet: UnknownRecord & { ids: unknown[]; members: unknown };
  addition: UnknownRecord;
  eligibility: UnknownRecord;
  merge: UnknownRecord & { parents: unknown[] };
  canonical: UnknownRecord;
  callerWorkflow: unknown;
  gatekeeper: unknown;
  reviewInputs: UnknownRecord;
  assurance: UnknownRecord;
  outcome: OwnerAdditionAdoptionResult;
};

function fail(message: string): never { throw new Error(`OWNER_ADDITION finalizer: ${message}`); }

export function buildOwnerAdditionFinalRecord({ repository, targetBranch, pullRequestNumber, baseSha, bSha, bTree,
  authorityDigest, policy, selected, policySha256, policyPath, procedure, ordinaryDecision, authoritySet, eligibility,
  authoritySetProvenance, eligibilityEvidence, eligibilityArtifactBinding, merge, targetReadback,
  identities = {}, generatedAt = new Date().toISOString() }: OwnerAdditionFinalRecordInput): OwnerAdditionFinalRecord {
  // RegExp.test keeps its existing ToString coercion for these caller-owned values.
  if (!eligibilityArtifactBinding || !/^\d+$/.test(eligibilityArtifactBinding.checkRunId as string) ||
      !/^\d+$/.test(eligibilityArtifactBinding.artifactId as string) ||
      !/^sha256:[a-f0-9]{64}$/.test(eligibilityArtifactBinding.artifactDigest as string) ||
      eligibilityArtifactBinding.annotationTitle !== 'AGK_OWNER_ADDITION_ARTIFACT_V1' ||
      typeof eligibilityArtifactBinding.annotationMessage !== 'string') {
    fail('verified eligibility artifact identity is missing from the final record.');
  }
  validateMultiAuthorityProvenance(authoritySetProvenance);
  if (authoritySetProvenance.selfRepository !== repository || authoritySetProvenance.authorityRevision !== baseSha ||
      authoritySetProvenance.setDigest !== authoritySet.digest ||
      authoritySetProvenance.members.length !== authoritySet.ids.length ||
      authoritySetProvenance.members.some((member, index) => member.id !== authoritySet.ids[index])) {
    fail('verified Authority Set provenance does not match the final record binding.');
  }
  // Keep the evaluator's intentionally closed evidence shape separate from
  // the richer serialized record that carries the tag's authority binding.
  const adoptionProcedure = { status: procedure.status, digest: procedure.digest, repository: procedure.repository,
    baseSha: procedure.baseSha, bSha: procedure.bSha, targetBranch: procedure.targetBranch,
    pullRequestNumber: procedure.pullRequestNumber, tagTargetSha: procedure.tagTargetSha,
    tagObjectOid: procedure.tagObjectOid, ownerDecisionId: procedure.ownerDecisionId,
    authoritySetDigest: procedure.authoritySetDigest, authorityIds: procedure.authorityIds };
  const result = evaluateOwnerAdditionAdoption({ candidate: { repository, targetBranch,
    pullRequest: { number: pullRequestNumber }, baseSha, bSha, bTree, authorityDigest }, procedure: adoptionProcedure,
  ordinaryDecision, authoritySet, eligibility, eligibilityEvidence, merge, targetReadback });
  return {
    version: 1,
    // Date.parse keeps its existing coercion; the cast only satisfies its string parameter.
    generatedAt: new Date(Date.parse(generatedAt as string)).toISOString(),
    candidate: { repository, targetBranch, pullRequestNumber, baseSha, bSha, bTree },
    selectedPolicy: { path: policyPath, revision: baseSha, version: policy.version, sha256: policySha256,
      mode: selected.mode, producer: selected.adoptionEvidenceProducer,
      workflowPath: selected.adoptionEvidenceWorkflowPath, jobName: selected.adoptionEvidenceJobName },
    authoritySet: { ids: [...authoritySet.ids], digest: authoritySet.digest,
      repository: authoritySetProvenance.selfRepository, revision: authoritySetProvenance.authorityRevision,
      manifestSha256: authoritySetProvenance.manifestSha256,
      members: authoritySetProvenance.members.map(member => ({ ...member })) },
    addition: { authorityId: procedure.authorityId, authorityPath: procedure.authorityPath,
      tagRef: procedure.tagRef, tagObjectOid: procedure.tagObjectOid,
      additionRecordSha256: procedure.additionRecordSha256, ownerDecisionId: procedure.missingDecisionId,
      authoritySha256: authorityDigest, refReadback: identities.g0TagReadback ?? { status: 'unavailable' } },
    eligibility: { result: eligibility.result, digest: eligibility.digest,
      producer: result.eligibilityProducer, completedAt: result.eligibilityCompletedAt,
      artifactBinding: { ...eligibilityArtifactBinding } },
    merge: { sha: merge.commit.sha, parents: [...merge.commit.parents], tree: merge.commit.tree,
      mergedAt: merge.hostMetadata.mergedAt },
    canonical: { ref: targetReadback.targetRef, observedSha: targetReadback.targetSha,
      authoritySha256: targetReadback.authorityDigest },
    callerWorkflow: identities.callerWorkflow ?? { path: null, revision: baseSha, sha256: null, status: 'unavailable' },
    gatekeeper: identities.gatekeeper ?? { workflowPath: selected.adoptionEvidenceWorkflowPath,
      runtimeRevision: null, status: 'unavailable' },
    reviewInputs: { ordinary: { prompt: identities.ordinaryPrompt ?? { path: null, sha256: null, status: 'unavailable' },
        schema: identities.ordinarySchema ?? { path: null, sha256: null, status: 'unavailable' },
        validation: identities.validation ?? { path: null, sha256: null, status: 'not_selected' } },
      ownerAddition: { prompt: identities.prompt ?? { path: null, sha256: null, status: 'unavailable' },
        schema: identities.schema ?? { path: null, sha256: null, status: 'unavailable' } } },
    assurance: { principalAuthentication: result.principalAuthentication,
      hostEnforcement: 'not_verified', policyProtection: 'not_claimed',
      eligibilityProducerTime: result.eligibilityCompletedAt },
    outcome: result,
  };
}
