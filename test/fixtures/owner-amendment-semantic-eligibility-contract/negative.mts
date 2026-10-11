import { createOwnerAmendmentSemanticEligibilityProducer, type OwnerAmendmentSemanticEligibilityProducerDependencies } from '../../../src/owner-amendment-semantic-eligibility.mjs';

const wrongAsync: OwnerAmendmentSemanticEligibilityProducerDependencies = {
  resolveProtectedInputs: async () => ({ baseBranch: 'main', policyBytes: Buffer.alloc(0), manifestBytes: Buffer.alloc(0), authoritySet: {}, changes: [], diffBytes: Buffer.alloc(0) }),
  resolveExactGitDiff: ({ repository, baseSha, bSha }) => ({ diffBytes: Buffer.from(`${repository}:${baseSha}:${bSha}`) }),
  resolveExactBFiles: ({ paths }) => ({ files: paths.map(path => ({ path, bytes: Buffer.from(path) })) }),
  resolveProtectedSelection: () => ({ selectedProducer: { workflowPath: '', workflowSha: '', workflowRef: '', runId: '', runAttempt: '', jobId: '' }, selectedGatekeeper: {} }),
  validateTriggerProvenance: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER' }),
  validateAmendmentRecord: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_RECORD', purpose: '', changes: [] }),
  validateTag: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG' }),
};
createOwnerAmendmentSemanticEligibilityProducer(wrongAsync);

const producer = createOwnerAmendmentSemanticEligibilityProducer({
  resolveProtectedInputs: () => ({ baseBranch: 'main', policyBytes: Buffer.alloc(0), manifestBytes: Buffer.alloc(0), authoritySet: {}, changes: [], diffBytes: Buffer.alloc(0) }),
  resolveExactGitDiff: ({ repository, baseSha, bSha }) => ({ diffBytes: Buffer.from(`${repository}:${baseSha}:${bSha}`) }),
  resolveExactBFiles: ({ paths }) => ({ files: paths.map(path => ({ path, bytes: Buffer.from(path) })) }),
  resolveProtectedSelection: () => ({ selectedProducer: { workflowPath: '', workflowSha: '', workflowRef: '', runId: '', runAttempt: '', jobId: '' }, selectedGatekeeper: {} }),
  validateTriggerProvenance: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER' }),
  validateAmendmentRecord: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_RECORD', purpose: '', changes: [] }),
  validateTag: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG' }),
});
// @ts-expect-error The prepared result exposes the producer's actual fixed status literal.
const wrongStatus: 'VERIFIED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_RECEIPT' = producer.prepare({ repository: 'x/y', baseSha: 'a', bSha: 'b', triggerProfile: 'completed-block-v1',
  policyRevision: 'a', triggerReviewRecordBytes: Buffer.alloc(0), triggerProducer: {}, amendmentRecordBytes: Buffer.alloc(0), tag: {},
  tagObjectBytes: Buffer.alloc(0), producer: {}, gatekeeper: {}, reviewModel: 'model', reviewReasoningEffort: 'low' }).status;
void wrongStatus;
