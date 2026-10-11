import { createOwnerAmendmentSemanticEligibilityProducer, type OwnerAmendmentSemanticEligibilityProducerDependencies as Dependencies } from '../../../src/owner-amendment-semantic-eligibility.mjs';
import { completeOwnerAmendmentSemanticEligibility as completeGrouped,
  validateOwnerAmendmentSemanticEligibilityReceipt as validateGrouped } from '../../../src/owner-amendment/owner-amendment-semantic-eligibility.mts';
import { completeOwnerAmendmentSemanticEligibility as completeFlat,
  validateOwnerAmendmentSemanticEligibilityReceipt as validateFlat } from '../../../src/owner-amendment-semantic-eligibility.mjs';

const protectedInputs = {
  baseBranch: 'main', policyBytes: Buffer.alloc(0), manifestBytes: Buffer.alloc(0),
  authoritySet: { digest: 'digest', members: [{ id: 'authority', repository: 'owner/repository',
    resolvedCommit: 'revision', path: 'AUTHORITY.md', byteLength: 1, sha256: 'digest', bytes: Buffer.from('x') }] },
  changes: [{ path: 'AUTHORITY.md', beforeBytes: Buffer.from('a'), afterBytes: Buffer.from('b') }],
  diffBytes: Buffer.alloc(0),
};
const validateTrigger: Dependencies['validateTriggerProvenance'] = ({ expected }) => ({
  status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository: expected.repository, baseSha: expected.baseSha,
  triggerProfile: expected.triggerProfile, triggerReviewRecordSha256: expected.triggerReviewRecordSha256,
  workflowPath: expected.workflowPath, workflowSha: expected.workflowSha, workflowRef: expected.workflowRef,
  runId: expected.runId, runAttempt: expected.runAttempt,
});
const validateRecord: Dependencies['validateAmendmentRecord'] = ({ expected }) => {
  const common = { status: 'VERIFIED_OWNER_AMENDMENT_RECORD' as const, repository: expected.repository,
    baseSha: expected.baseSha, bSha: expected.bSha, policyRevision: expected.policyRevision,
    triggerReviewRecordSha256: expected.triggerReviewRecordSha256, priorAuthoritySetDigest: expected.authoritySetDigest,
    resultingAuthoritySetDigest: expected.resultingAuthoritySetDigest, changes: expected.changes,
    targetValidated: true, purpose: expected.purpose };
  return expected.triggerProfile === 'completed-owner-decision-self-v1' ? {
    ...common, triggerProfile: 'completed-owner-decision-self-v1' as const,
    authorityId: expected.authorityId, authorityPath: expected.authorityPath,
  } : { ...common, triggerProfile: 'completed-block-v1' as const };
};
const validateTag: Dependencies['validateTag'] = ({ expected }) => ({
  status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository: expected.repository, baseSha: expected.baseSha,
  bSha: expected.bSha, triggerProfile: expected.triggerProfile,
  triggerReviewRecordSha256: expected.triggerReviewRecordSha256, amendmentRecordSha256: expected.amendmentRecordSha256,
  tagRef: expected.tagRef, tagObjectOid: expected.tagObjectOid, observedTagRefOid: expected.observedTagRefOid,
});
const dependencies: Dependencies = {
  resolveProtectedInputs: () => protectedInputs,
  resolveExactGitDiff: ({ repository, baseSha, bSha }) => ({ diffBytes: Buffer.from(`${repository}:${baseSha}:${bSha}`) }),
  resolveExactBFiles: ({ repository, bSha, paths }) => ({ files: paths.map(path => ({ path, bytes: Buffer.from(`${repository}:${bSha}:${path}`) })) }),
  resolveProtectedSelection: ({ repository, baseSha }) => ({
    selectedProducer: { workflowPath: '.github/workflows/review.yml', workflowSha: String(baseSha),
      workflowRef: 'refs/heads/main', runId: '1', runAttempt: '1', jobId: 'review' },
    selectedGatekeeper: { repository, revision: baseSha,
      package: { name: '@flair-agency/architecture-gatekeeper', version: '1.0.0', integrity: 'sha512-example' } },
  }),
  validateTriggerProvenance: validateTrigger,
  validateAmendmentRecord: validateRecord,
  validateTag,
};
const wrongAsync: Dependencies = { ...dependencies, resolveProtectedInputs: async () => protectedInputs };
createOwnerAmendmentSemanticEligibilityProducer(wrongAsync);
const producer = createOwnerAmendmentSemanticEligibilityProducer(dependencies);
const prepared = producer.prepare({ repository: 'flair-agency/architecture-gatekeeper', baseSha: 'a'.repeat(40),
  bSha: 'b'.repeat(40), triggerProfile: 'completed-block-v1', policyRevision: 'a'.repeat(40),
  triggerReviewRecordBytes: Buffer.alloc(0), triggerProducer: {}, amendmentRecordBytes: Buffer.alloc(0), tag: {},
  tagObjectBytes: Buffer.alloc(0), producer: {}, gatekeeper: {}, reviewModel: 'model', reviewReasoningEffort: 'low' });
// @ts-expect-error prepared outputs are frozen.
prepared.status = prepared.status;
const status: 'PREPARED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY' = prepared.status;
void status;

// @ts-expect-error the factory requires its complete collaborator set.
createOwnerAmendmentSemanticEligibilityProducer();
// @ts-expect-error an empty object omits all required collaborators.
createOwnerAmendmentSemanticEligibilityProducer({});

const resolveDiffIndependently: Dependencies['resolveExactGitDiff'] =
  (input: { repository: unknown; baseSha: unknown; bSha: unknown }) => ({
    diffBytes: Buffer.from(`${input.repository}:${input.baseSha}:${input.bSha}`),
  });
const independentDependencies: Dependencies = {
  ...dependencies,
  resolveProtectedInputs: (input: { repository: unknown; baseSha: unknown; bSha: unknown; triggerProfile: unknown }) => ({
    ...protectedInputs, baseBranch: String(input.repository), authoritySet: { digest: null, members: [] }, changes: [],
  }),
  resolveExactGitDiff: resolveDiffIndependently,
  resolveExactBFiles: (input: { repository: unknown; bSha: unknown; paths: readonly string[] }) => ({
    files: input.paths.map(path => ({ path, bytes: Buffer.from(path) })),
  }),
  resolveProtectedSelection: (input: { repository: unknown; baseSha: unknown; bSha: unknown; triggerProfile: unknown;
    baseBranch: string; policyBytes: Buffer; manifestBytes: Buffer }) => ({
    selectedProducer: { workflowPath: '', workflowSha: '', workflowRef: '', runId: '', runAttempt: '', jobId: '' },
    selectedGatekeeper: { repository: input.repository, revision: input.baseSha, package: null },
  }),
};
const independentlyComposedProducer = createOwnerAmendmentSemanticEligibilityProducer(independentDependencies);
const composedPrepared = independentlyComposedProducer.prepare({ repository: 'owner/repository', baseSha: 'a', bSha: 'b',
  triggerProfile: 'completed-block-v1', policyRevision: 'a', triggerReviewRecordBytes: Buffer.alloc(0), triggerProducer: {},
  amendmentRecordBytes: Buffer.alloc(0), tag: {}, tagObjectBytes: Buffer.alloc(0), producer: {}, gatekeeper: {},
  reviewModel: 'model', reviewReasoningEffort: 'low' });
const composed = independentlyComposedProducer.complete({ prepared: composedPrepared, decisionBytes: Buffer.alloc(0),
  producer: {}, gatekeeper: {}, reviewModel: 'model', reviewReasoningEffort: 'low' });
// @ts-expect-error completed outputs are frozen.
composed.receiptBytes = composed.receiptBytes;
const verified = independentlyComposedProducer.validateReceipt({ receiptBytes: composed.receiptBytes, expected: composed.receipt });
// @ts-expect-error verified outputs are frozen.
verified.eligibility = verified.eligibility;
const eligibility: 'ELIGIBLE' | 'INELIGIBLE' = verified.eligibility;
void eligibility;

const wrongStatusProducer = producer;
// @ts-expect-error the prepared result exposes the producer's actual fixed status literal.
const wrongStatus: 'VERIFIED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_RECEIPT' = wrongStatusProducer.prepare({ repository: 'x/y', baseSha: 'a', bSha: 'b', triggerProfile: 'completed-block-v1',
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
