import { createOwnerAmendmentSemanticEligibilityProducer, type OwnerAmendmentSemanticEligibilityProducerDependencies } from '../../../src/owner-amendment-semantic-eligibility.mjs';
import { completeOwnerAmendmentSemanticEligibility as completeGrouped,
  validateOwnerAmendmentSemanticEligibilityReceipt as validateGrouped } from '../../../src/owner-amendment/owner-amendment-semantic-eligibility.mts';
import { completeOwnerAmendmentSemanticEligibility as completeFlat,
  validateOwnerAmendmentSemanticEligibilityReceipt as validateFlat } from '../../../src/owner-amendment-semantic-eligibility.mjs';

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

// @ts-expect-error The frozen producer's prepare method cannot be reassigned.
producer.prepare = producer.prepare;
// @ts-expect-error The frozen producer's complete method cannot be reassigned.
producer.complete = producer.complete;
// @ts-expect-error The frozen producer's validateReceipt method cannot be reassigned.
producer.validateReceipt = producer.validateReceipt;
// @ts-expect-error The direct grouped overload requires its explicit input.
completeGrouped();
// @ts-expect-error The direct grouped overload requires its explicit input.
validateGrouped();
// @ts-expect-error The flat facade re-export requires its explicit input.
completeFlat();
// @ts-expect-error The flat facade re-export requires its explicit input.
validateFlat();
// @ts-expect-error Factory-produced complete requires its explicit input.
producer.complete();
// @ts-expect-error Factory-produced validateReceipt requires its explicit input.
producer.validateReceipt();
