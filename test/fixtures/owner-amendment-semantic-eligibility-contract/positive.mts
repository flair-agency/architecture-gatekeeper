import { createOwnerAmendmentSemanticEligibilityProducer, type OwnerAmendmentSemanticEligibilityProducerDependencies } from '../../../src/owner-amendment-semantic-eligibility.mjs';

const dependencies: OwnerAmendmentSemanticEligibilityProducerDependencies = {
  resolveProtectedInputs: ({ repository, baseSha, bSha, triggerProfile }) => {
    const request = [repository, baseSha, bSha, triggerProfile];
    if (request.some(value => typeof value !== 'string')) throw new Error('invalid request');
    return { baseBranch: 'main', policyBytes: Buffer.alloc(0), manifestBytes: Buffer.alloc(0),
      authoritySet: { digest: 'digest', members: [{ id: 'id', repository: 'owner/repository', resolvedCommit: 'revision',
        path: 'AUTHORITY.md', byteLength: 1, sha256: 'digest', bytes: Buffer.from('x') }] },
      changes: [{ path: 'AUTHORITY.md', beforeBytes: Buffer.from('a'), afterBytes: Buffer.from('b') }], diffBytes: Buffer.alloc(0) };
  },
  resolveExactGitDiff: ({ repository, baseSha, bSha }) => ({ diffBytes: Buffer.from(`${repository}:${baseSha}:${bSha}`) }),
  resolveExactBFiles: ({ repository, bSha, paths }) => ({ files: paths.map(path => ({ path, bytes: Buffer.from(`${repository}:${bSha}:${path}`) })) }),
  resolveProtectedSelection: () => ({ selectedProducer: { workflowPath: '.github/workflows/review.yml', workflowSha: 'a'.repeat(40),
    workflowRef: 'refs/heads/main', runId: '1', runAttempt: '1', jobId: 'review' }, selectedGatekeeper: {
      repository: 'flair-agency/architecture-gatekeeper', revision: 'a'.repeat(40),
      package: { name: '@flair-agency/architecture-gatekeeper', version: '1.0.0', integrity: 'sha512-example' },
    } }),
  validateTriggerProvenance: ({ expected }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER',
    repository: expected.repository, baseSha: expected.baseSha, triggerProfile: expected.triggerProfile,
    triggerReviewRecordSha256: expected.triggerReviewRecordSha256, workflowPath: expected.workflowPath,
    workflowSha: expected.workflowSha, workflowRef: expected.workflowRef, runId: expected.runId, runAttempt: expected.runAttempt }),
  validateAmendmentRecord: ({ expected }) => expected.triggerProfile === 'completed-owner-decision-self-v1' ? ({
    status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository: expected.repository, baseSha: expected.baseSha,
    bSha: expected.bSha, policyRevision: expected.policyRevision, triggerProfile: 'completed-owner-decision-self-v1',
    triggerReviewRecordSha256: expected.triggerReviewRecordSha256, priorAuthoritySetDigest: expected.authoritySetDigest,
    resultingAuthoritySetDigest: expected.resultingAuthoritySetDigest, changes: expected.changes, targetValidated: true,
    purpose: 'review', authorityId: expected.authorityId, authorityPath: expected.authorityPath,
  }) : ({
    status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository: expected.repository, baseSha: expected.baseSha,
    bSha: expected.bSha, policyRevision: expected.policyRevision, triggerProfile: 'completed-block-v1',
    triggerReviewRecordSha256: expected.triggerReviewRecordSha256, priorAuthoritySetDigest: expected.authoritySetDigest,
    resultingAuthoritySetDigest: expected.resultingAuthoritySetDigest, changes: expected.changes, targetValidated: true,
    purpose: 'review',
  }),
  validateTag: ({ expected }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository: expected.repository,
    baseSha: expected.baseSha, bSha: expected.bSha, triggerProfile: expected.triggerProfile,
    triggerReviewRecordSha256: expected.triggerReviewRecordSha256, amendmentRecordSha256: expected.amendmentRecordSha256,
    tagRef: expected.tagRef, tagObjectOid: expected.tagObjectOid, observedTagRefOid: expected.observedTagRefOid }),
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
    authoritySet: { digest: null, members: [] }, changes: [], diffBytes: Buffer.alloc(0),
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
  validateTriggerProvenance: (input: { bytes: Buffer; expected: Record<string, unknown> }) => ({
    status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository: input.expected.repository, baseSha: input.expected.baseSha,
    triggerProfile: input.expected.triggerProfile, triggerReviewRecordSha256: input.expected.triggerReviewRecordSha256,
    workflowPath: input.expected.workflowPath, workflowSha: input.expected.workflowSha, workflowRef: input.expected.workflowRef,
    runId: input.expected.runId, runAttempt: input.expected.runAttempt,
  }),
  validateAmendmentRecord: (input: { bytes: Buffer; expected: Record<string, unknown> }) => {
    const expected = input.expected;
    const common = { status: 'VERIFIED_OWNER_AMENDMENT_RECORD' as const, repository: expected.repository,
      baseSha: expected.baseSha, bSha: expected.bSha, policyRevision: expected.policyRevision,
      triggerReviewRecordSha256: expected.triggerReviewRecordSha256, priorAuthoritySetDigest: expected.authoritySetDigest,
      resultingAuthoritySetDigest: expected.resultingAuthoritySetDigest, changes: expected.changes,
      targetValidated: true, purpose: expected.purpose };
    return expected.triggerProfile === 'completed-owner-decision-self-v1' ? {
      ...common, triggerProfile: 'completed-owner-decision-self-v1' as const,
      authorityId: expected.authorityId, authorityPath: expected.authorityPath,
    } : { ...common, triggerProfile: 'completed-block-v1' as const };
  },
  validateTag: (input: { tag: Readonly<{ tagRef: unknown; tagObjectOid: unknown; observedTagRefOid: unknown }>;
    tagObjectBytes: Buffer; expected: Record<string, unknown> }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG',
      repository: input.expected.repository, baseSha: input.expected.baseSha, bSha: input.expected.bSha,
      triggerProfile: input.expected.triggerProfile, triggerReviewRecordSha256: input.expected.triggerReviewRecordSha256,
      amendmentRecordSha256: input.expected.amendmentRecordSha256, tagRef: input.expected.tagRef,
      tagObjectOid: input.expected.tagObjectOid, observedTagRefOid: input.expected.observedTagRefOid }),
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
