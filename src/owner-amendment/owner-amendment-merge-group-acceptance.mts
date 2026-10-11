import { createHash } from 'node:crypto';
import { parseGithubMergeGroupEvent } from '../github-merge-group-event.mjs';
import type { GitHubMergeGroupEventFacts } from '../github/github-merge-group-event.mts';
import { validateOwnerAmendmentSemanticEligibilityReceipt } from '../owner-amendment-semantic-eligibility.mjs';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REVIEW_INPUT_BYTES = 1_048_576;
const MAX_OWNER_PROMPT_BYTES = 1_048_576;
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
const DECISION_BY_PROFILE = Object.freeze({
  'completed-block-v1': 'BLOCK',
  'completed-owner-decision-self-v1': 'OWNER_DECISION',
});
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment merge-group acceptance: ${message}`); };
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
type UnknownRecord = Record<string, unknown>;
type Awaitable<T> = T | PromiseLike<T>;
// These erased views describe existing property accesses. They do not validate or authenticate adapter results.
type ValueView = UnknownRecord;
type PolicyView = ValueView & { authorityIds: readonly unknown[] };
type ReviewInputsView = ValueView & { authorityIds: readonly unknown[]; changes: readonly unknown[] };
type ValidatedReviewInputsView = ValueView & { authorityIds: readonly unknown[]; changes: unknown };
type TagView = ValueView & { changes: readonly unknown[] };
type ChangeView = { path?: unknown; beforeSha256?: unknown; afterSha256?: unknown };
type ReceiptView = ValueView & { authorityIds?: unknown; changes?: unknown; tag?: unknown; producer?: unknown; gatekeeper?: unknown };
type RuntimeView = { repository?: unknown; revision?: unknown };
type ReceiptValidationOperationView = (input: Readonly<{ receiptBytes: unknown; expected: unknown }>) => Readonly<{ status: unknown; eligibility: unknown }>;
type SelectionView = ValueView & { bPullRequestCreatedAtMs: number; queueEnteredAtMs: number };
const exact = (value: unknown, keys: readonly string[], label: string): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown fields.`);
};
const when = (value: unknown, label: string): number => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label} is invalid.`);
  }
  return Date.parse(value);
};

function validateSelection(value: ValueView, event: GitHubMergeGroupEventFacts): SelectionView {
  exact(value, ['status', 'repository', 'repositoryId', 'mergeGroupBaseSha', 'mergeGroupHeadSha',
    'bPrNumber', 'bBaseSha', 'bHeadSha', 'bPullRequestCreatedAt', 'queueEntryState', 'queueEnteredAt'], 'selected B queue context');
  if (value.status !== 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT' || value.repository !== event.repository ||
      value.mergeGroupBaseSha !== event.baseSha || value.mergeGroupHeadSha !== event.headSha ||
      value.bBaseSha !== event.baseSha || !Number.isSafeInteger(value.repositoryId as number) || (value.repositoryId as number) < 1 ||
      !/^[1-9]\d*$/.test(value.bPrNumber as string) || !SHA1.test((value.bHeadSha ?? '') as string) ||
      !['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED'].includes(value.queueEntryState as string)) {
    fail('selected queue entry does not identify exact B, repository, base and merge-group head.');
  }
  const createdAt = when(value.bPullRequestCreatedAt, 'exact B pull-request creation time');
  const queuedAt = when(value.queueEnteredAt, 'merge queue entry time');
  if (createdAt > queuedAt) fail('exact B pull request was created after merge queue entry.');
  return Object.freeze({ ...value, bPullRequestCreatedAtMs: createdAt, queueEnteredAtMs: queuedAt });
}

function validatePolicy(value: PolicyView, selection: SelectionView): PolicyView {
  exact(value, ['status', 'repository', 'baseSha', 'grade', 'scope', 'triggerProfile', 'authorityId',
    'authorityPath', 'authoritySha256', 'tagNamespace', 'policySha256', 'authoritySetDigest', 'authorityIds',
    'model', 'reasoningEffort', 'maxPromptBytes'], 'previous-base amendment selection');
  if (value.status !== 'RESOLVED_PREVIOUS_OWNER_AMENDMENT_POLICY' || value.repository !== selection.repository ||
      value.baseSha !== selection.bBaseSha || value.grade !== 'G0' || value.scope !== 'authority-only' ||
      !PROFILES.has(value.triggerProfile as string) || typeof value.authorityId !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(value.authorityId) || typeof value.authorityPath !== 'string' ||
      !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(value.authorityPath) ||
      value.authorityPath.split('/').some(part => part === '.' || part === '..') ||
      !SHA256.test((value.authoritySha256 ?? '') as string) || value.tagNamespace !== 'refs/tags/architecture-gatekeeper/amendments' ||
      !SHA256.test((value.policySha256 ?? '') as string) || !SHA256.test((value.authoritySetDigest ?? '') as string) ||
      typeof value.model !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(value.model) ||
      !EFFORTS.has(value.reasoningEffort as string) || !Number.isSafeInteger(value.maxPromptBytes as number) ||
      (value.maxPromptBytes as number) < 1 || (value.maxPromptBytes as number) > MAX_OWNER_PROMPT_BYTES ||
      !Array.isArray(value.authorityIds) || !value.authorityIds.length || value.authorityIds.length > 32 ||
      value.authorityIds.some((id: unknown) => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) ||
      !value.authorityIds.includes(value.authorityId) || new Set(value.authorityIds).size !== value.authorityIds.length) {
    fail('previous protected-base policy does not explicitly select a supported G0 route and complete Authority Set.');
  }
  return Object.freeze({ ...value, authorityIds: Object.freeze([...value.authorityIds]) });
}

function validateReviewInputs(value: ReviewInputsView, policy: PolicyView, selection: SelectionView, trigger: ValueView, tag: TagView): ValidatedReviewInputsView {
  exact(value, ['status', 'repository', 'baseSha', 'bSha', 'triggerProfile', 'triggerReviewRecordSha256',
    'amendmentRecordSha256', 'policySha256', 'authoritySetDigest', 'priorAuthoritySetDigest',
    'resultingAuthoritySetDigest', 'authorityIds', 'changes', 'diffSha256',
    'promptSha256', 'schemaSha256', 'model', 'reasoningEffort', 'diffBytes', 'promptBytes', 'schemaBytes'],
  'exact protected eligibility review inputs');
  if (value.status !== 'RESOLVED_PROTECTED_OWNER_AMENDMENT_REVIEW_INPUTS' ||
      value.repository !== selection.repository || value.baseSha !== selection.bBaseSha || value.bSha !== selection.bHeadSha ||
      value.triggerProfile !== policy.triggerProfile || value.triggerReviewRecordSha256 !== trigger.reviewRecordSha256 ||
      value.amendmentRecordSha256 !== tag.amendmentRecordSha256 || value.policySha256 !== policy.policySha256 ||
      value.authoritySetDigest !== policy.authoritySetDigest || value.priorAuthoritySetDigest !== policy.authoritySetDigest ||
      value.resultingAuthoritySetDigest !== tag.resultingAuthoritySetDigest || !Array.isArray(value.authorityIds) ||
      value.authorityIds.length !== policy.authorityIds.length || value.authorityIds.some((id: unknown, index: number) => id !== policy.authorityIds[index]) ||
      value.model !== policy.model || value.reasoningEffort !== policy.reasoningEffort ||
      !Buffer.isBuffer(value.diffBytes) || !value.diffBytes.length || value.diffBytes.length > MAX_REVIEW_INPUT_BYTES ||
      !Buffer.isBuffer(value.promptBytes) || !value.promptBytes.length || value.promptBytes.length > (policy.maxPromptBytes as number) ||
      !Buffer.isBuffer(value.schemaBytes) || !value.schemaBytes.length || value.schemaBytes.length > MAX_REVIEW_INPUT_BYTES ||
      !SHA256.test((value.diffSha256 ?? '') as string) || value.diffSha256 !== digest(value.diffBytes as Buffer) ||
      !SHA256.test((value.promptSha256 ?? '') as string) || value.promptSha256 !== digest(value.promptBytes as Buffer) ||
      !SHA256.test((value.schemaSha256 ?? '') as string) || value.schemaSha256 !== digest(value.schemaBytes as Buffer)) {
    fail('exact protected eligibility review inputs do not match selected B, policy, trigger, tag, model and effort.');
  }
  if (!Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > 32 ||
      value.changes.some((change: unknown) => !change || typeof change !== 'object' || Array.isArray(change) ||
        Object.keys(change as object).length !== 3 || !Object.hasOwn(change as object, 'path') ||
        !Object.hasOwn(change as object, 'beforeSha256') || !Object.hasOwn(change as object, 'afterSha256') ||
        typeof (change as ChangeView).path !== 'string' || !SHA256.test(((change as ChangeView).beforeSha256 ?? '') as string) ||
        !SHA256.test(((change as ChangeView).afterSha256 ?? '') as string) || (change as ChangeView).beforeSha256 === (change as ChangeView).afterSha256)) {
    fail('prepared exact B authority changes are malformed.');
  }
  if (value.changes.some((change: unknown, index: number) => index > 0 && (((value.changes[index - 1] as ChangeView).path as string) >= ((change as ChangeView).path as string))) ||
      (policy.triggerProfile === 'completed-block-v1' && value.changes.length !== 1) ||
      !Array.isArray(tag.changes) || tag.changes.length !== value.changes.length ||
      value.changes.some((change: unknown, index: number) => Object.keys(tag.changes[index] ?? {}).length !== 3 ||
        (tag.changes[index] as ChangeView).path !== (change as ChangeView).path || (tag.changes[index] as ChangeView).beforeSha256 !== (change as ChangeView).beforeSha256 ||
        (tag.changes[index] as ChangeView).afterSha256 !== (change as ChangeView).afterSha256)) {
    fail('prepared full Authority Set changes differ from the signed amendment record.');
  }
  if (!value.changes.some((change: unknown) => (change as ChangeView).path === policy.authorityPath &&
      (change as ChangeView).beforeSha256 === policy.authoritySha256 && (change as ChangeView).afterSha256 === tag.amendedAuthoritySha256)) {
    fail('prepared exact B authority changes omit the selected amendment target.');
  }
  return Object.freeze({ ...value, authorityIds: Object.freeze([...value.authorityIds]),
    changes: Object.freeze(value.changes.map((change: unknown) => Object.freeze({ ...(change as UnknownRecord) }))) }) as ValidatedReviewInputsView;
}

function validateTrigger(value: ValueView, policy: PolicyView, selection: SelectionView): ValueView {
  exact(value, ['status', 'repository', 'baseSha', 'triggerProfile', 'decision', 'reviewRecordSha256',
    'producerWorkflowPath', 'producerWorkflowSha', 'producerWorkflowRef', 'producerRunId', 'producerRunAttempt', 'provenanceVerified'], 'verified trigger evidence');
  const expectedDecision = DECISION_BY_PROFILE[policy.triggerProfile as keyof typeof DECISION_BY_PROFILE];
  if (value.status !== 'VERIFIED_OWNER_AMENDMENT_TRIGGER' || value.repository !== selection.repository ||
      value.baseSha !== selection.bBaseSha || value.triggerProfile !== policy.triggerProfile ||
      value.decision !== expectedDecision || !SHA256.test((value.reviewRecordSha256 ?? '') as string) ||
      value.producerWorkflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      value.producerWorkflowSha !== selection.bBaseSha || value.producerWorkflowRef !== 'refs/heads/main' ||
      !/^[1-9]\d*$/.test((value.producerRunId ?? '') as string) || !/^[1-9]\d*$/.test((value.producerRunAttempt ?? '') as string) ||
      value.provenanceVerified !== true) {
    fail('completed trigger evidence is missing, stale, profile-mismatched, or lacks verified producer provenance.');
  }
  return Object.freeze({ ...value });
}

function validateTag(value: TagView, policy: PolicyView, selection: SelectionView, trigger: ValueView): TagView {
  exact(value, ['status', 'repository', 'baseSha', 'bSha', 'triggerProfile', 'triggerReviewRecordSha256',
    'amendmentRecordSha256', 'authorityId', 'authorityPath', 'previousAuthoritySha256', 'amendedAuthoritySha256',
    'priorAuthoritySetDigest', 'resultingAuthoritySetDigest', 'changes', 'purpose', 'targetValidated', 'tagRef', 'tagObjectOid',
    'observedTagRefOid', 'protectedAgainstUpdateAndDeletion'], 'verified protected tag');
  if (value.status !== 'VERIFIED_OWNER_AMENDMENT_TAG' || value.repository !== selection.repository ||
      value.baseSha !== selection.bBaseSha || value.bSha !== selection.bHeadSha || value.triggerProfile !== policy.triggerProfile ||
      value.triggerReviewRecordSha256 !== trigger.reviewRecordSha256 || !SHA256.test((value.amendmentRecordSha256 ?? '') as string) ||
      value.authorityId !== policy.authorityId || value.authorityPath !== policy.authorityPath ||
      value.previousAuthoritySha256 !== policy.authoritySha256 || !SHA256.test((value.amendedAuthoritySha256 ?? '') as string) ||
      value.priorAuthoritySetDigest !== policy.authoritySetDigest || !SHA256.test((value.resultingAuthoritySetDigest ?? '') as string) ||
      !Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > 32 ||
      value.changes.some((change: unknown, index: number) => !change || Object.keys(change as object).length !== 3 ||
        typeof (change as ChangeView).path !== 'string' || !SHA256.test(((change as ChangeView).beforeSha256 ?? '') as string) || !SHA256.test(((change as ChangeView).afterSha256 ?? '') as string) ||
        (change as ChangeView).beforeSha256 === (change as ChangeView).afterSha256 || (index > 0 && ((value.changes[index - 1] as ChangeView).path as string) >= ((change as ChangeView).path as string))) ||
      (policy.triggerProfile === 'completed-block-v1' && value.changes.length !== 1) ||
      typeof value.purpose !== 'string' || !(value.purpose as string).trim() || (value.purpose as string).length > 500 || value.targetValidated !== true ||
      value.tagRef !== `${policy.tagNamespace}/${selection.bHeadSha}` || !SHA1.test((value.tagObjectOid ?? '') as string) ||
      value.observedTagRefOid !== value.tagObjectOid || value.protectedAgainstUpdateAndDeletion !== true) {
    fail('protected annotated tag does not bind the exact B, profile, trigger and amendment record.');
  }
  return Object.freeze({ ...value });
}

function validateEligibility(value: ValueView, policy: PolicyView, selection: SelectionView, trigger: ValueView, tag: TagView, runtime: ValueView, reviewInputs: ValidatedReviewInputsView): ValueView {
  exact(value, ['status', 'receiptBytes', 'receiptSha256', 'artifactId', 'artifactSha256',
    'provenanceVerified', 'checkConclusion', 'completedAt', 'producerWorkflowPath', 'producerWorkflowSha',
    'producerWorkflowRef', 'producerRunId', 'producerRunAttempt', 'producerJobId', 'gatekeeperRepository',
    'gatekeeperRevision', 'principalAuthentication', 'exactClaimAuthorization'], 'verified semantic eligibility evidence');
  if (!Buffer.isBuffer(value.receiptBytes) || !(value.receiptBytes as Buffer).length || (value.receiptBytes as Buffer).length > 131_072 ||
      !SHA256.test((value.receiptSha256 ?? '') as string) || digest(value.receiptBytes as Buffer) !== value.receiptSha256) {
    fail('exact semantic eligibility receipt bytes or digest are missing or invalid.');
  }
  let receipt: ReceiptView;
  try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value.receiptBytes as Buffer)) as ReceiptView; }
  catch { fail('semantic eligibility receipt bytes are invalid JSON.'); }
  const expectedReceipt = { ...receipt, changes: reviewInputs.changes, diffSha256: reviewInputs.diffSha256,
    promptSha256: reviewInputs.promptSha256, schemaSha256: reviewInputs.schemaSha256,
    model: policy.model, reasoningEffort: policy.reasoningEffort };
  // The existing receipt verifier performs the runtime validation; this erased call view keeps its parsed inputs unknown here.
  const receiptValidation = (validateOwnerAmendmentSemanticEligibilityReceipt as ReceiptValidationOperationView)({ receiptBytes: value.receiptBytes, expected: expectedReceipt });
  if (value.status !== 'VERIFIED_OWNER_AMENDMENT_ELIGIBILITY_EVIDENCE' ||
      receiptValidation.status !== 'VERIFIED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_RECEIPT' ||
      receiptValidation.eligibility !== 'ELIGIBLE' ||
      receipt.repository !== selection.repository || receipt.baseSha !== selection.bBaseSha || receipt.bSha !== selection.bHeadSha ||
      receipt.triggerProfile !== policy.triggerProfile || receipt.triggerReviewRecordSha256 !== trigger.reviewRecordSha256 ||
      receipt.amendmentRecordSha256 !== tag.amendmentRecordSha256 || receipt.policyRevision !== selection.bBaseSha ||
      receipt.policySha256 !== policy.policySha256 || receipt.authoritySetDigest !== policy.authoritySetDigest ||
      !Array.isArray(receipt.authorityIds) || (receipt.authorityIds as unknown[]).length !== policy.authorityIds.length ||
      (receipt.authorityIds as unknown[]).some((id: unknown, index: number) => id !== policy.authorityIds[index]) ||
      (receipt.tag as ValueView).tagRef !== tag.tagRef || (receipt.tag as ValueView).tagObjectOid !== tag.tagObjectOid ||
      (receipt.tag as ValueView).observedTagRefOid !== tag.observedTagRefOid ||
      !(receipt.changes as unknown[]).some((change: unknown) => (change as ChangeView).path === policy.authorityPath &&
        (change as ChangeView).beforeSha256 === policy.authoritySha256 && (change as ChangeView).afterSha256 === tag.amendedAuthoritySha256) ||
      (receipt.producer as ValueView).workflowPath !== value.producerWorkflowPath || (receipt.producer as ValueView).workflowSha !== value.producerWorkflowSha ||
      (receipt.producer as ValueView).workflowRef !== value.producerWorkflowRef || (receipt.producer as ValueView).runId !== value.producerRunId ||
      (receipt.producer as ValueView).runAttempt !== value.producerRunAttempt || (receipt.producer as ValueView).jobId !== value.producerJobId ||
      typeof value.artifactId !== 'string' || !/^[1-9]\d*$/.test(value.artifactId as string) || !SHA256.test((value.receiptSha256 ?? '') as string) ||
      !SHA256.test((value.artifactSha256 ?? '') as string) || value.provenanceVerified !== true || value.checkConclusion !== 'success' ||
      value.producerWorkflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      value.producerWorkflowSha !== selection.bBaseSha || value.producerWorkflowRef !== 'refs/heads/main' ||
      !/^[1-9]\d*$/.test((value.producerRunId ?? '') as string) || !/^[1-9]\d*$/.test((value.producerRunAttempt ?? '') as string) ||
      typeof value.producerJobId !== 'string' || !value.producerJobId.trim() ||
      value.gatekeeperRepository !== runtime.repository || value.gatekeeperRevision !== runtime.revision ||
      (receipt.gatekeeper as ValueView).repository !== runtime.repository || (receipt.gatekeeper as ValueView).revision !== runtime.revision ||
      value.principalAuthentication !== 'not_verified' || value.exactClaimAuthorization !== 'not_verified') {
    fail('semantic eligibility receipt, attestation, producer/runtime identity, or protected selections do not match.');
  }
  const completedAt = when(value.completedAt, 'semantic eligibility producer completion time');
  if (completedAt >= selection.queueEnteredAtMs) fail('semantic eligibility producer did not complete before B entered the merge queue.');
  return Object.freeze({ ...value, receipt: Object.freeze(receipt), completedAtMs: completedAt });
}

type SelectBContextCall = Readonly<{ event: unknown }>;
type ResolveProtectedPolicyCall = Readonly<{ selection: SelectionView; baseSha: unknown }>;
type VerifyTriggerCall = Readonly<{ selection: SelectionView; policy: PolicyView }>;
type VerifyTagCall = Readonly<{ selection: SelectionView; policy: PolicyView; trigger: ValueView }>;
type ResolveEligibilityReviewInputsCall = Readonly<{ selection: SelectionView; policy: PolicyView; trigger: ValueView; tag: TagView }>;
type VerifyEligibilityCall = ResolveEligibilityReviewInputsCall;
export type OwnerAmendmentMergeGroupAcceptanceAdapters = Readonly<{
  selectBContext?: (input: SelectBContextCall) => Awaitable<unknown>;
  resolveProtectedPolicy?: (input: ResolveProtectedPolicyCall) => Awaitable<unknown>;
  verifyTrigger?: (input: VerifyTriggerCall) => Awaitable<unknown>;
  verifyTag?: (input: VerifyTagCall) => Awaitable<unknown>;
  resolveEligibilityReviewInputs?: (input: ResolveEligibilityReviewInputsCall) => Awaitable<unknown>;
  verifyEligibility?: (input: VerifyEligibilityCall) => Awaitable<unknown>;
  runtime?: unknown;
  [key: string]: unknown;
}>;
type VerifiedAcceptanceResult = Readonly<{
  status: 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION'; repository: unknown; eligibility: 'eligible'; adoption: 'pending'; canonical: 'pending';
  baseSha: unknown; bSha: unknown; mergeGroupHeadSha: unknown; bPrNumber: unknown; triggerProfile: unknown; triggerDecision: unknown;
  triggerReviewRecordSha256: unknown; amendmentRecordSha256: unknown; authoritySetDigest: unknown; resultingAuthoritySetDigest: unknown;
  changes: unknown; eligibilityReceiptSha256: unknown; eligibilityArtifactId: unknown;
  eligibilityProducerRunId: unknown; eligibilityProducerRunAttempt: unknown; eligibilityProducerJobId: unknown;
  eligibilityCompletedAt: unknown; queueEnteredAt: unknown; tagRef: unknown; tagObjectOid: unknown;
  assurance: Readonly<{ principalAuthentication: 'not_verified'; exactClaimAuthorization: 'not_verified' }>;
  reason?: never;
}>;
type IncompleteAcceptanceResult = Readonly<{
  status: 'INCOMPLETE'; reason: unknown;
  repository?: never; eligibility?: never; adoption?: never; canonical?: never; baseSha?: never; bSha?: never;
  mergeGroupHeadSha?: never; bPrNumber?: never; triggerProfile?: never; triggerDecision?: never; triggerReviewRecordSha256?: never;
  amendmentRecordSha256?: never; authoritySetDigest?: never; resultingAuthoritySetDigest?: never; changes?: never;
  eligibilityReceiptSha256?: never; eligibilityArtifactId?: never; eligibilityProducerRunId?: never;
  eligibilityProducerRunAttempt?: never; eligibilityProducerJobId?: never; eligibilityCompletedAt?: never;
  queueEnteredAt?: never; tagRef?: never; tagObjectOid?: never; assurance?: never;
}>;
export type OwnerAmendmentMergeGroupAcceptanceResult = VerifiedAcceptanceResult | IncompleteAcceptanceResult;
export type OwnerAmendmentMergeGroupAcceptanceVerifier = Readonly<{
  verify: (event: unknown) => Promise<OwnerAmendmentMergeGroupAcceptanceResult>;
}>;

/**
 * Construct a deterministic merge-group OWNER_AMENDMENT gate from trusted
 * adapters. Each adapter must independently retrieve and validate the
 * indicated GitHub/Git evidence; caller-provided event and returned objects
 * are untrusted until those adapters return their closed verified result.
 */
export function createOwnerAmendmentMergeGroupAcceptanceVerifier({ selectBContext, resolveProtectedPolicy,
  verifyTrigger, verifyTag, resolveEligibilityReviewInputs, verifyEligibility, runtime }:
  OwnerAmendmentMergeGroupAcceptanceAdapters = {}) : OwnerAmendmentMergeGroupAcceptanceVerifier {
  for (const [name, fn] of Object.entries({ selectBContext, resolveProtectedPolicy, verifyTrigger, verifyTag,
    resolveEligibilityReviewInputs, verifyEligibility })) {
    if (typeof fn !== 'function') fail(`trusted ${name} adapter is required.`);
  }
  exact(runtime, ['repository', 'revision'], 'selected Gatekeeper runtime');
  if ((runtime as RuntimeView).repository !== 'flair-agency/architecture-gatekeeper' || !SHA1.test(((runtime as RuntimeView).revision ?? '') as string)) {
    fail('selected Gatekeeper runtime identity is invalid.');
  }
  const selectedRuntime = Object.freeze({ ...(runtime as UnknownRecord) });
  return Object.freeze({
    async verify(event: unknown): Promise<OwnerAmendmentMergeGroupAcceptanceResult> {
      try {
        const parsed = parseGithubMergeGroupEvent(event);
        if (parsed.status !== 'PARSED_MERGE_GROUP_EVENT') fail(parsed.reason ?? 'merge-group event is invalid.');
        if (parsed.baseRef !== 'refs/heads/main' || parsed.baseSha === parsed.headSha) fail('event is not for the protected self main merge group.');
        const selection = validateSelection(await selectBContext!({ event }) as ValueView, parsed);
        const policy = validatePolicy(await resolveProtectedPolicy!({ selection, baseSha: selection.bBaseSha }) as PolicyView, selection);
        const trigger = validateTrigger(await verifyTrigger!({ selection, policy }) as ValueView, policy, selection);
        const tag = validateTag(await verifyTag!({ selection, policy, trigger }) as TagView, policy, selection, trigger);
        const reviewInputs = validateReviewInputs(await resolveEligibilityReviewInputs!({ selection, policy, trigger, tag }) as ReviewInputsView,
          policy, selection, trigger, tag);
        const eligibility = validateEligibility(await verifyEligibility!({ selection, policy, trigger, tag }) as ValueView,
          policy, selection, trigger, tag, selectedRuntime, reviewInputs);
        return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION', repository: selection.repository,
          eligibility: 'eligible', adoption: 'pending', canonical: 'pending',
          baseSha: selection.bBaseSha, bSha: selection.bHeadSha, mergeGroupHeadSha: selection.mergeGroupHeadSha,
          bPrNumber: selection.bPrNumber, triggerProfile: policy.triggerProfile,
          triggerDecision: trigger.decision, triggerReviewRecordSha256: trigger.reviewRecordSha256,
          amendmentRecordSha256: tag.amendmentRecordSha256, authoritySetDigest: policy.authoritySetDigest,
          resultingAuthoritySetDigest: tag.resultingAuthoritySetDigest, changes: reviewInputs.changes,
          eligibilityReceiptSha256: eligibility.receiptSha256, eligibilityArtifactId: eligibility.artifactId,
          eligibilityProducerRunId: eligibility.producerRunId, eligibilityProducerRunAttempt: eligibility.producerRunAttempt,
          eligibilityProducerJobId: eligibility.producerJobId, eligibilityCompletedAt: eligibility.completedAt,
          queueEnteredAt: selection.queueEnteredAt, tagRef: tag.tagRef, tagObjectOid: tag.tagObjectOid,
          assurance: Object.freeze({ principalAuthentication: 'not_verified', exactClaimAuthorization: 'not_verified' }) });
      } catch (error) {
        return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
      }
    },
  });
}
