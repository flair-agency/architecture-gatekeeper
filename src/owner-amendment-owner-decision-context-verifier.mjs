import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true });
const SHA1 = /^[a-f0-9]{40}$/; const SHA256 = /^[a-f0-9]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Owner amendment OWNER_DECISION context: ${message}`); };
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(`${label} has missing or unknown fields.`);
}
function parse(bytes, label, max) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > max) fail(`${label} bytes are missing or oversized.`);
  let text, value;
  try { text = decoder.decode(bytes); rejectDuplicateJsonKeys(text, label); value = JSON.parse(text); }
  catch (error) { fail(`${label} is invalid: ${error.message}`); }
  return { text, value };
}

/** Verify the v3 OWNER_DECISION tag payload against exact protected Git state. */
export function verifyOwnerAmendmentOwnerDecisionContext({ tagEnvelope, trustedContext } = {}) {
  try {
    exact(trustedContext, ['repository', 'baseSha', 'bSha', 'policyRevision', 'policy', 'authority'], 'trusted context');
    exact(trustedContext.policy, ['grade', 'scope', 'triggerProfile', 'authorities'], 'previous policy selection');
    if (trustedContext.policy.grade !== 'G0' || trustedContext.policy.scope !== 'authority-only' ||
        trustedContext.policy.triggerProfile !== 'completed-owner-decision-self-v1' ||
        trustedContext.policyRevision !== trustedContext.baseSha || !SHA1.test(trustedContext.baseSha ?? '') ||
        !SHA1.test(trustedContext.bSha ?? '') || trustedContext.baseSha === trustedContext.bSha) fail('protected base does not select the exact OWNER_DECISION profile.');
    exact(tagEnvelope, ['headSha', 'tag', 'tagRef', 'observedTagRefOid', 'reviewRecordBytes',
      'attestationBundleBytes', 'amendmentRecordBytes', 'triggerProfile'], 'tag envelope');
    if (tagEnvelope.headSha !== trustedContext.bSha || tagEnvelope.triggerProfile !== trustedContext.policy.triggerProfile ||
        tagEnvelope.tagRef !== `refs/tags/architecture-gatekeeper/amendments/${trustedContext.bSha}` ||
        tagEnvelope.observedTagRefOid !== tagEnvelope.tag?.objectOid || !SHA1.test(tagEnvelope.observedTagRefOid ?? '')) fail('tag does not bind protected exact B/profile/ref.');
    const { value: trigger } = parse(tagEnvelope.reviewRecordBytes, 'OWNER_DECISION ReviewRecord', 131_072);
    exact(trigger, ['version','kind','repository','prNumber','baseSha','headSha','mergeSha','workflowSha','workflowPath','runId','runAttempt',
      'authority','inputDigests','decisionSha256','decisionBytesBase64','decision'], 'trigger ReviewRecord');
    if (trigger.version !== 1 || trigger.kind !== 'owner-amendment-owner-decision-review-record' ||
        trigger.repository !== trustedContext.repository || trigger.baseSha !== trustedContext.baseSha || trigger.workflowSha !== trustedContext.baseSha ||
        trigger.headSha === trustedContext.bSha || !SHA1.test(trigger.headSha ?? '') || !SHA1.test(trigger.mergeSha ?? '') ||
        !Number.isSafeInteger(trigger.prNumber) || trigger.prNumber < 1 || trigger.decision?.decision !== 'OWNER_DECISION' ||
        ![trigger.runId, trigger.runAttempt].every(x => typeof x === 'string' && /^[1-9]\d*$/.test(x))) fail('trigger is not exact completed OWNER_DECISION evidence.');
    if (typeof trigger.decisionBytesBase64 !== 'string') fail('trigger decision bytes are absent.');
    const decisionBytes = Buffer.from(trigger.decisionBytesBase64, 'base64');
    const { value: exactDecision } = parse(decisionBytes, 'exact OWNER_DECISION', 65_536);
    if (decisionBytes.toString('base64') !== trigger.decisionBytesBase64 || hash(decisionBytes) !== trigger.decisionSha256 ||
        JSON.stringify(exactDecision) !== JSON.stringify(trigger.decision)) fail('trigger decision digest/content differs from exact bytes.');
    const member = trigger.authority?.members?.find(item => item.id === trustedContext.authority.id &&
      item.path === trustedContext.authority.path && item.repository === trustedContext.repository && item.resolvedCommit === trustedContext.baseSha);
    if (!member || member.sha256 !== trustedContext.authority.previousSha256 ||
        trigger.authority.authorityRevision !== trustedContext.baseSha || trigger.authority.selfRepository !== trustedContext.repository) fail('trigger does not bind target authority at exact previous base.');
    const reviewDigest = hash(tagEnvelope.reviewRecordBytes); const bundleDigest = hash(tagEnvelope.attestationBundleBytes);
    const { text: amendmentText, value: amendment } = parse(tagEnvelope.amendmentRecordBytes, 'OWNER_DECISION AmendmentRecord', 8_192);
    exact(amendment, ['version','kind','triggerProfile','repository','baseSha','headSha','policyRevision','authority',
      'triggeringReviewSha256','attestationBundleSha256','purpose'], 'AmendmentRecord');
    exact(amendment.authority, ['id','path','previousSha256','newSha256'], 'AmendmentRecord authority');
    if (amendmentText !== `${JSON.stringify(amendment)}\n` || amendment.version !== 1 ||
        amendment.kind !== 'owner-amendment-owner-decision-amendment-record' || amendment.triggerProfile !== trustedContext.policy.triggerProfile ||
        amendment.repository !== trustedContext.repository || amendment.baseSha !== trustedContext.baseSha ||
        amendment.headSha !== trustedContext.bSha || amendment.policyRevision !== trustedContext.policyRevision ||
        amendment.authority.id !== trustedContext.authority.id || amendment.authority.path !== trustedContext.authority.path ||
        amendment.authority.previousSha256 !== trustedContext.authority.previousSha256 || amendment.authority.newSha256 !== trustedContext.authority.newSha256 ||
        amendment.triggeringReviewSha256 !== reviewDigest ||
        amendment.attestationBundleSha256 !== bundleDigest || typeof amendment.purpose !== 'string' || !amendment.purpose.trim() || amendment.purpose.length > 500) {
      fail('AmendmentRecord does not bind exact OWNER_DECISION, B and previous authority bytes.');
    }
    return Object.freeze({ status: 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT', repository: trustedContext.repository,
      baseSha: trustedContext.baseSha, bSha: trustedContext.bSha, policyRevision: trustedContext.policyRevision,
      triggerProfile: trustedContext.policy.triggerProfile,
      reviewRecordSha256: reviewDigest, attestationBundleSha256: bundleDigest,
      amendmentRecordSha256: hash(tagEnvelope.amendmentRecordBytes), tagObjectOid: tagEnvelope.tag.objectOid,
      authorityId: amendment.authority.id, authorityPath: amendment.authority.path,
      previousAuthoritySha256: amendment.authority.previousSha256, proposedAuthoritySha256: amendment.authority.newSha256,
      purpose: amendment.purpose });
  } catch (error) { return Object.freeze({ status: 'INCOMPLETE', reason: error.message }); }
}
