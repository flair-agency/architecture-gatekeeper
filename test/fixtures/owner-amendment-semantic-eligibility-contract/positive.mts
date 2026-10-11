import { createOwnerAmendmentSemanticEligibilityProducer, type OwnerAmendmentSemanticEligibilityProducerDependencies } from '../../../src/owner-amendment-semantic-eligibility.mjs';

const dependencies: OwnerAmendmentSemanticEligibilityProducerDependencies = {
  resolveProtectedInputs: ({ repository, baseSha, bSha, triggerProfile }) => {
    const request = [repository, baseSha, bSha, triggerProfile];
    if (request.some(value => typeof value !== 'string')) throw new Error('invalid request');
    return { baseBranch: 'main', policyBytes: Buffer.alloc(0), manifestBytes: Buffer.alloc(0), authoritySet: {}, changes: [], diffBytes: Buffer.alloc(0) };
  },
  resolveExactGitDiff: ({ repository, baseSha, bSha }) => ({ diffBytes: Buffer.from(`${repository}:${baseSha}:${bSha}`) }),
  resolveExactBFiles: ({ repository, bSha, paths }) => ({ files: paths.map(path => ({ path, bytes: Buffer.from(`${repository}:${bSha}:${path}`) })) }),
  resolveProtectedSelection: () => ({ selectedProducer: { workflowPath: '.github/workflows/review.yml', workflowSha: 'a'.repeat(40),
    workflowRef: 'refs/heads/main', runId: '1', runAttempt: '1', jobId: 'review' }, selectedGatekeeper: { repository: 'flair-agency/architecture-gatekeeper' } }),
  validateTriggerProvenance: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER' }),
  validateAmendmentRecord: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_RECORD', purpose: 'review', changes: [] }),
  validateTag: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG' }),
};

const producer = createOwnerAmendmentSemanticEligibilityProducer(dependencies);
const prepared = producer.prepare({ repository: 'flair-agency/architecture-gatekeeper', baseSha: 'a'.repeat(40),
  bSha: 'b'.repeat(40), triggerProfile: 'completed-block-v1', policyRevision: 'a'.repeat(40),
  triggerReviewRecordBytes: Buffer.alloc(0), triggerProducer: {}, amendmentRecordBytes: Buffer.alloc(0), tag: {},
  tagObjectBytes: Buffer.alloc(0), producer: {}, gatekeeper: {}, reviewModel: 'model', reviewReasoningEffort: 'low' });
const status: 'PREPARED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY' = prepared.status;
void status;

const resolveDiffIndependently: OwnerAmendmentSemanticEligibilityProducerDependencies['resolveExactGitDiff'] =
  (input: { repository: unknown; baseSha: unknown; bSha: unknown }) => ({
    diffBytes: Buffer.from(`${input.repository}:${input.baseSha}:${input.bSha}`),
  });
const independentDependencies: OwnerAmendmentSemanticEligibilityProducerDependencies = {
  resolveProtectedInputs: (input: { repository: unknown; baseSha: unknown; bSha: unknown; triggerProfile: unknown }) => ({
    baseBranch: String(input.repository), policyBytes: Buffer.alloc(0), manifestBytes: Buffer.alloc(0),
    authoritySet: null, changes: null, diffBytes: Buffer.alloc(0),
  }),
  resolveExactGitDiff: resolveDiffIndependently,
  resolveExactBFiles: (input: { repository: unknown; bSha: unknown; paths: readonly string[] }) => ({
    files: input.paths.map(path => ({ path, bytes: Buffer.from(path) })),
  }),
  resolveProtectedSelection: (input: { repository: unknown; baseSha: unknown; bSha: unknown; triggerProfile: unknown;
    baseBranch: string; policyBytes: Buffer; manifestBytes: Buffer }) => ({
    selectedProducer: { workflowPath: '', workflowSha: '', workflowRef: '', runId: '', runAttempt: '', jobId: '' },
    selectedGatekeeper: { repository: input.repository },
  }),
  validateTriggerProvenance: (input: { bytes: Buffer; expected: Record<string, unknown> }) => ({
    status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', ...input.expected,
  }),
  validateAmendmentRecord: (input: { bytes: Buffer; expected: Record<string, unknown> }) => ({
    status: 'VERIFIED_OWNER_AMENDMENT_RECORD', purpose: input.expected.purpose, changes: input.expected.changes,
  }),
  validateTag: (input: { tag: Readonly<{ tagRef: unknown; tagObjectOid: unknown; observedTagRefOid: unknown }>;
    tagObjectBytes: Buffer; expected: Record<string, unknown> }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', tag: input.tag }),
};
const independentlyComposedProducer = createOwnerAmendmentSemanticEligibilityProducer(independentDependencies);
const composedPrepared = independentlyComposedProducer.prepare({ repository: 'owner/repository', baseSha: 'a', bSha: 'b',
  triggerProfile: 'completed-block-v1', policyRevision: 'a', triggerReviewRecordBytes: Buffer.alloc(0), triggerProducer: {},
  amendmentRecordBytes: Buffer.alloc(0), tag: {}, tagObjectBytes: Buffer.alloc(0), producer: {}, gatekeeper: {},
  reviewModel: 'model', reviewReasoningEffort: 'low' });
const composed = independentlyComposedProducer.complete({ prepared: composedPrepared, decisionBytes: Buffer.alloc(0),
  producer: {}, gatekeeper: {}, reviewModel: 'model', reviewReasoningEffort: 'low' });
const verified = independentlyComposedProducer.validateReceipt({ receiptBytes: composed.receiptBytes, expected: composed.receipt });
const eligibility: 'ELIGIBLE' | 'INELIGIBLE' = verified.eligibility;
void eligibility;
