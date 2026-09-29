import { createHash } from 'node:crypto';
import { parseGithubMergeGroupEvent } from './github-merge-group-event.mjs';
import { validateOwnerAmendmentSemanticEligibilityReceipt } from './owner-amendment-semantic-eligibility.mjs';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
const DECISION_BY_PROFILE = Object.freeze({
  'completed-block-v1': 'BLOCK',
  'completed-owner-decision-self-v1': 'OWNER_DECISION',
});
const fail = message => { throw new Error(`Owner amendment merge-group acceptance: ${message}`); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown fields.`);
};
const when = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label} is invalid.`);
  }
  return Date.parse(value);
};

function validateSelection(value, event) {
  exact(value, ['status', 'repository', 'repositoryId', 'mergeGroupBaseSha', 'mergeGroupHeadSha',
    'bPrNumber', 'bBaseSha', 'bHeadSha', 'queueEntryState', 'queueEnteredAt'], 'selected B queue context');
  if (value.status !== 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT' || value.repository !== event.repository ||
      value.mergeGroupBaseSha !== event.baseSha || value.mergeGroupHeadSha !== event.headSha ||
      value.bBaseSha !== event.baseSha || !Number.isSafeInteger(value.repositoryId) || value.repositoryId < 1 ||
      !/^[1-9]\d*$/.test(value.bPrNumber) || !SHA1.test(value.bHeadSha ?? '') ||
      !['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED'].includes(value.queueEntryState)) {
    fail('selected queue entry does not identify exact B, repository, base and merge-group head.');
  }
  const queuedAt = when(value.queueEnteredAt, 'merge queue entry time');
  return Object.freeze({ ...value, queueEnteredAtMs: queuedAt });
}

function validatePolicy(value, selection) {
  exact(value, ['status', 'repository', 'baseSha', 'grade', 'scope', 'triggerProfile', 'authorityId',
    'authorityPath', 'authoritySha256', 'tagNamespace', 'policySha256', 'authoritySetDigest', 'authorityIds'], 'previous-base amendment selection');
  if (value.status !== 'RESOLVED_PREVIOUS_OWNER_AMENDMENT_POLICY' || value.repository !== selection.repository ||
      value.baseSha !== selection.bBaseSha || value.grade !== 'G0' || value.scope !== 'authority-only' ||
      !PROFILES.has(value.triggerProfile) || typeof value.authorityId !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(value.authorityId) || typeof value.authorityPath !== 'string' ||
      !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(value.authorityPath) ||
      value.authorityPath.split('/').some(part => part === '.' || part === '..') ||
      !SHA256.test(value.authoritySha256 ?? '') || value.tagNamespace !== 'refs/tags/architecture-gatekeeper/amendments' ||
      !SHA256.test(value.policySha256 ?? '') || !SHA256.test(value.authoritySetDigest ?? '') ||
      !Array.isArray(value.authorityIds) || !value.authorityIds.length || value.authorityIds.length > 32 ||
      value.authorityIds.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) ||
      !value.authorityIds.includes(value.authorityId) || new Set(value.authorityIds).size !== value.authorityIds.length) {
    fail('previous protected-base policy does not explicitly select a supported G0 route and complete Authority Set.');
  }
  return Object.freeze({ ...value, authorityIds: Object.freeze([...value.authorityIds]) });
}

function validateTrigger(value, policy, selection) {
  exact(value, ['status', 'repository', 'baseSha', 'triggerProfile', 'decision', 'ownerDecisionId', 'reviewRecordSha256',
    'producerWorkflowPath', 'producerWorkflowSha', 'producerWorkflowRef', 'producerRunId', 'producerRunAttempt', 'provenanceVerified'], 'verified trigger evidence');
  const expectedDecision = DECISION_BY_PROFILE[policy.triggerProfile];
  const ownerDecisionIdValid = policy.triggerProfile === 'completed-owner-decision-self-v1'
    ? typeof value.ownerDecisionId === 'string' && value.ownerDecisionId.trim().length > 0 && value.ownerDecisionId.length <= 160
    : value.ownerDecisionId === null;
  if (value.status !== 'VERIFIED_OWNER_AMENDMENT_TRIGGER' || value.repository !== selection.repository ||
      value.baseSha !== selection.bBaseSha || value.triggerProfile !== policy.triggerProfile ||
      value.decision !== expectedDecision || !ownerDecisionIdValid || !SHA256.test(value.reviewRecordSha256 ?? '') ||
      value.producerWorkflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      value.producerWorkflowSha !== selection.bBaseSha || value.producerWorkflowRef !== 'refs/heads/main' ||
      !/^[1-9]\d*$/.test(value.producerRunId ?? '') || !/^[1-9]\d*$/.test(value.producerRunAttempt ?? '') ||
      value.provenanceVerified !== true) {
    fail('completed trigger evidence is missing, stale, profile-mismatched, or lacks verified producer provenance.');
  }
  return Object.freeze({ ...value });
}

function validateTag(value, policy, selection, trigger) {
  exact(value, ['status', 'repository', 'baseSha', 'bSha', 'triggerProfile', 'triggerReviewRecordSha256',
    'amendmentRecordSha256', 'authorityId', 'authorityPath', 'previousAuthoritySha256', 'amendedAuthoritySha256',
    'priorAuthoritySetDigest', 'resultingAuthoritySetDigest', 'purpose', 'targetValidated', 'tagRef', 'tagObjectOid',
    'observedTagRefOid', 'protectedAgainstUpdateAndDeletion'], 'verified protected tag');
  if (value.status !== 'VERIFIED_OWNER_AMENDMENT_TAG' || value.repository !== selection.repository ||
      value.baseSha !== selection.bBaseSha || value.bSha !== selection.bHeadSha || value.triggerProfile !== policy.triggerProfile ||
      value.triggerReviewRecordSha256 !== trigger.reviewRecordSha256 || !SHA256.test(value.amendmentRecordSha256 ?? '') ||
      value.authorityId !== policy.authorityId || value.authorityPath !== policy.authorityPath ||
      value.previousAuthoritySha256 !== policy.authoritySha256 || !SHA256.test(value.amendedAuthoritySha256 ?? '') ||
      value.priorAuthoritySetDigest !== policy.authoritySetDigest || !SHA256.test(value.resultingAuthoritySetDigest ?? '') ||
      typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.length > 500 || value.targetValidated !== true ||
      value.tagRef !== `${policy.tagNamespace}/${selection.bHeadSha}` || !SHA1.test(value.tagObjectOid ?? '') ||
      value.observedTagRefOid !== value.tagObjectOid || value.protectedAgainstUpdateAndDeletion !== true) {
    fail('protected annotated tag does not bind the exact B, profile, trigger and amendment record.');
  }
  return Object.freeze({ ...value });
}

function validateEligibility(value, policy, selection, trigger, tag, runtime) {
  exact(value, ['status', 'receiptBytes', 'receiptSha256', 'artifactId', 'artifactSha256',
    'provenanceVerified', 'checkConclusion', 'completedAt', 'producerWorkflowPath', 'producerWorkflowSha',
    'producerWorkflowRef', 'producerRunId', 'producerRunAttempt', 'producerJobId', 'gatekeeperRepository',
    'gatekeeperRevision', 'principalAuthentication', 'exactClaimAuthorization'], 'verified semantic eligibility evidence');
  if (!Buffer.isBuffer(value.receiptBytes) || !value.receiptBytes.length || value.receiptBytes.length > 131_072 ||
      !SHA256.test(value.receiptSha256 ?? '') || digest(value.receiptBytes) !== value.receiptSha256) {
    fail('exact semantic eligibility receipt bytes or digest are missing or invalid.');
  }
  let receipt;
  try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value.receiptBytes)); }
  catch { fail('semantic eligibility receipt bytes are invalid JSON.'); }
  const receiptValidation = validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: value.receiptBytes, expected: receipt });
  if (value.status !== 'VERIFIED_OWNER_AMENDMENT_ELIGIBILITY_EVIDENCE' ||
      receiptValidation.status !== 'VERIFIED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_RECEIPT' ||
      receiptValidation.eligibility !== 'ELIGIBLE' ||
      receipt.repository !== selection.repository || receipt.baseSha !== selection.bBaseSha || receipt.bSha !== selection.bHeadSha ||
      receipt.triggerProfile !== policy.triggerProfile || receipt.triggerReviewRecordSha256 !== trigger.reviewRecordSha256 ||
      receipt.amendmentRecordSha256 !== tag.amendmentRecordSha256 || receipt.policyRevision !== selection.bBaseSha ||
      receipt.policySha256 !== policy.policySha256 || receipt.authoritySetDigest !== policy.authoritySetDigest ||
      !Array.isArray(receipt.authorityIds) || receipt.authorityIds.length !== policy.authorityIds.length ||
      receipt.authorityIds.some((id, index) => id !== policy.authorityIds[index]) ||
      receipt.tag.tagRef !== tag.tagRef || receipt.tag.tagObjectOid !== tag.tagObjectOid ||
      receipt.tag.observedTagRefOid !== tag.observedTagRefOid ||
      !receipt.changes.some(change => change.path === policy.authorityPath &&
        change.beforeSha256 === policy.authoritySha256 && change.afterSha256 === tag.amendedAuthoritySha256) ||
      receipt.producer.workflowPath !== value.producerWorkflowPath || receipt.producer.workflowSha !== value.producerWorkflowSha ||
      receipt.producer.workflowRef !== value.producerWorkflowRef || receipt.producer.runId !== value.producerRunId ||
      receipt.producer.runAttempt !== value.producerRunAttempt || receipt.producer.jobId !== value.producerJobId ||
      typeof value.artifactId !== 'string' || !/^[1-9]\d*$/.test(value.artifactId) || !SHA256.test(value.receiptSha256 ?? '') ||
      !SHA256.test(value.artifactSha256 ?? '') || value.provenanceVerified !== true || value.checkConclusion !== 'success' ||
      value.producerWorkflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      value.producerWorkflowSha !== selection.bBaseSha || value.producerWorkflowRef !== 'refs/heads/main' ||
      !/^[1-9]\d*$/.test(value.producerRunId ?? '') || !/^[1-9]\d*$/.test(value.producerRunAttempt ?? '') ||
      typeof value.producerJobId !== 'string' || !value.producerJobId.trim() ||
      value.gatekeeperRepository !== runtime.repository || value.gatekeeperRevision !== runtime.revision ||
      receipt.gatekeeper.repository !== runtime.repository || receipt.gatekeeper.revision !== runtime.revision ||
      value.principalAuthentication !== 'not_verified' || value.exactClaimAuthorization !== 'not_verified') {
    fail('semantic eligibility receipt, attestation, producer/runtime identity, or protected selections do not match.');
  }
  const completedAt = when(value.completedAt, 'semantic eligibility producer completion time');
  if (completedAt >= selection.queueEnteredAtMs) fail('semantic eligibility producer did not complete before B entered the merge queue.');
  return Object.freeze({ ...value, receipt: Object.freeze(receipt), completedAtMs: completedAt });
}

/**
 * Construct a deterministic merge-group OWNER_AMENDMENT gate from trusted
 * adapters. Each adapter must independently retrieve and validate the
 * indicated GitHub/Git evidence; caller-provided event and returned objects
 * are untrusted until those adapters return their closed verified result.
 */
export function createOwnerAmendmentMergeGroupAcceptanceVerifier({ selectBContext, resolveProtectedPolicy,
  verifyTrigger, verifyTag, verifyEligibility, runtime } = {}) {
  for (const [name, fn] of Object.entries({ selectBContext, resolveProtectedPolicy, verifyTrigger, verifyTag, verifyEligibility })) {
    if (typeof fn !== 'function') fail(`trusted ${name} adapter is required.`);
  }
  exact(runtime, ['repository', 'revision'], 'selected Gatekeeper runtime');
  if (runtime.repository !== 'flair-agency/architecture-gatekeeper' || !SHA1.test(runtime.revision ?? '')) {
    fail('selected Gatekeeper runtime identity is invalid.');
  }
  const selectedRuntime = Object.freeze({ ...runtime });
  return Object.freeze({
    async verify(event) {
      try {
        const parsed = parseGithubMergeGroupEvent(event);
        if (parsed.status !== 'PARSED_MERGE_GROUP_EVENT') fail(parsed.reason ?? 'merge-group event is invalid.');
        if (parsed.baseRef !== 'refs/heads/main' || parsed.baseSha === parsed.headSha) fail('event is not for the protected self main merge group.');
        const selection = validateSelection(await selectBContext({ event }), parsed);
        const policy = validatePolicy(await resolveProtectedPolicy({ selection, baseSha: selection.bBaseSha }), selection);
        const trigger = validateTrigger(await verifyTrigger({ selection, policy }), policy, selection);
        const tag = validateTag(await verifyTag({ selection, policy, trigger }), policy, selection, trigger);
        const eligibility = validateEligibility(await verifyEligibility({ selection, policy, trigger, tag }),
          policy, selection, trigger, tag, selectedRuntime);
        return Object.freeze({ status: 'ACCEPTED_OWNER_AMENDMENT_G0', repository: selection.repository,
          baseSha: selection.bBaseSha, bSha: selection.bHeadSha, mergeGroupHeadSha: selection.mergeGroupHeadSha,
          bPrNumber: selection.bPrNumber, triggerProfile: policy.triggerProfile,
          triggerDecision: trigger.decision, triggerReviewRecordSha256: trigger.reviewRecordSha256,
          amendmentRecordSha256: tag.amendmentRecordSha256, authoritySetDigest: policy.authoritySetDigest,
          eligibilityReceiptSha256: eligibility.receiptSha256, eligibilityArtifactId: eligibility.artifactId,
          eligibilityProducerRunId: eligibility.producerRunId, eligibilityProducerRunAttempt: eligibility.producerRunAttempt,
          eligibilityProducerJobId: eligibility.producerJobId, eligibilityCompletedAt: eligibility.completedAt,
          queueEnteredAt: selection.queueEnteredAt, tagRef: tag.tagRef, tagObjectOid: tag.tagObjectOid,
          assurance: Object.freeze({ principalAuthentication: 'not_verified', exactClaimAuthorization: 'not_verified' }) });
      } catch (error) {
        return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
      }
    },
  });
}
