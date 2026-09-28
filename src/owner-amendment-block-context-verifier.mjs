import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';
import { validateOwnerAmendmentG0TagEnvelope } from './owner-amendment.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(`Owner amendment BLOCK context: ${message}`); };

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown fields.`);
}

function parseJson(bytes, label, limit) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limit) fail(`${label} bytes are missing or oversized.`);
  let source;
  try { source = decoder.decode(bytes); } catch { fail(`${label} is not UTF-8.`); }
  try { rejectDuplicateJsonKeys(source, label); return JSON.parse(source); }
  catch (error) { fail(`${label} JSON is invalid: ${error.message}`); }
}

function sha(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${label} is invalid.`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function validateContext(context) {
  exact(context, ['repository', 'baseSha', 'bSha', 'policyRevision', 'policy', 'authority'], 'trusted context');
  sha(context.baseSha, SHA1, 'protected base SHA');
  sha(context.bSha, SHA1, 'exact B SHA');
  if (context.baseSha === context.bSha || context.policyRevision !== context.baseSha) fail('B or policy revision is stale.');
  if (typeof context.repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(context.repository)) fail('repository identity is invalid.');

  exact(context.policy, ['grade', 'scope', 'triggerProfile', 'authorities'], 'previous protected policy selection');
  if (context.policy.grade !== 'G0' || context.policy.scope !== 'authority-only' || context.policy.triggerProfile !== 'completed-block-v1' ||
      !Array.isArray(context.policy.authorities) || context.policy.authorities.length < 1 || context.policy.authorities.length > 32) {
    fail('previous policy does not select the self G0 completed-BLOCK profile.');
  }
  exact(context.authority, ['id', 'path', 'previousSha256', 'newSha256'], 'affected authority');
  if (typeof context.authority.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(context.authority.id) ||
      typeof context.authority.path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(context.authority.path) ||
      context.authority.path.length > 240 || context.authority.path.split('/').some(part => part === '.' || part === '..')) fail('affected authority identity is invalid.');
  sha(context.authority.previousSha256, SHA256, 'previous authority digest');
  sha(context.authority.newSha256, SHA256, 'new authority digest');
  if (context.authority.previousSha256 === context.authority.newSha256 ||
      !context.policy.authorities.some(item => item?.id === context.authority.id && item?.path === context.authority.path)) {
    fail('affected authority is unchanged or not authorized by the previous policy.');
  }
  return context;
}

/**
 * Check deterministic BLOCK AmendmentRecord bindings against caller-supplied
 * trusted Git/policy context. This does not authenticate those inputs, verify
 * attestation provenance, establish remote tag protection, or accept B.
 */
export function verifyOwnerAmendmentBlockContext({ tagEnvelope, trustedContext }) {
  const context = validateContext(trustedContext);
  const tagResult = validateOwnerAmendmentG0TagEnvelope(tagEnvelope);
  if (tagResult.headSha !== context.bSha) fail('tag envelope is not bound to exact B.');

  const reviewBytes = tagEnvelope.reviewRecordBytes;
  const amendmentBytes = tagEnvelope.amendmentRecordBytes;
  const review = parseJson(reviewBytes, 'ReviewRecord', 131_072);
  const amendment = parseJson(amendmentBytes, 'AmendmentRecord', 8_192);
  exact(review, ['version', 'kind', 'repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha',
    'workflowPath', 'runId', 'runAttempt', 'authority', 'inputDigests', 'decisionSha256', 'decisionBytesBase64', 'decision'], 'ReviewRecord');
  exact(amendment, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'authority',
    'triggeringReviewSha256', 'attestationBundleSha256', 'purpose'], 'AmendmentRecord');

  const reviewDigest = createHash('sha256').update(reviewBytes).digest('hex');
  if (review.version !== 1 || review.kind !== 'owner-amendment-block-review-record' || review.repository !== context.repository ||
      review.baseSha !== context.baseSha || review.workflowSha !== context.baseSha || review.headSha === context.baseSha || review.headSha === context.bSha ||
      !Number.isSafeInteger(review.prNumber) || review.prNumber < 1 || !SHA1.test(review.mergeSha ?? '') ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(review.workflowPath ?? '') ||
      ![review.runId, review.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value))) {
    fail('ReviewRecord is not a completed historical BLOCK for this repository and protected base.');
  }
  const member = review.authority?.members?.[0];
  if (review.authority?.selfRepository !== context.repository || review.authority.authorityRevision !== context.baseSha ||
      review.authority.members.length !== 1 || member?.id !== context.authority.id || member?.repository !== context.repository ||
      member?.path !== context.authority.path || member?.resolvedCommit !== context.baseSha ||
      member?.sha256 !== context.authority.previousSha256 || review.decision?.decision !== 'BLOCK' ||
      !Array.isArray(review.decision.authorityIds) || review.decision.authorityIds.length !== 1 ||
      review.decision.authorityIds[0] !== context.authority.id) fail('ReviewRecord does not contain the exact completed single-authority BLOCK for the affected previous authority.');
  if (typeof review.decisionBytesBase64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(review.decisionBytesBase64)) {
    fail('ReviewRecord decision bytes are missing or malformed.');
  }
  const decisionBytes = Buffer.from(review.decisionBytesBase64, 'base64');
  sha(review.decisionSha256, SHA256, 'ReviewRecord decision digest');
  if (!decisionBytes.length || decisionBytes.toString('base64') !== review.decisionBytesBase64 ||
      createHash('sha256').update(decisionBytes).digest('hex') !== review.decisionSha256) fail('ReviewRecord decision bytes or digest do not match.');
  const decision = parseJson(decisionBytes, 'BLOCK decision', 65_536);
  if (JSON.stringify(canonical(decision)) !== JSON.stringify(canonical(review.decision))) fail('ReviewRecord decision differs from its exact decision bytes.');
  if (amendment.version !== 2 || amendment.repository !== context.repository || amendment.baseSha !== context.baseSha ||
      amendment.headSha !== context.bSha || amendment.policyRevision !== context.policyRevision ||
      amendment.authority?.id !== context.authority.id || amendment.authority?.path !== context.authority.path ||
      amendment.authority?.previousSha256 !== context.authority.previousSha256 || amendment.authority?.newSha256 !== context.authority.newSha256 ||
      amendment.triggeringReviewSha256 !== reviewDigest ||
      amendment.attestationBundleSha256 !== tagResult.attestationBundleSha256 ||
      typeof amendment.purpose !== 'string' || !amendment.purpose.trim() || amendment.purpose.length > 500 || !/^[\x20-\x7e]+$/.test(amendment.purpose)) {
    fail('AmendmentRecord v2 does not bind exact B, previous policy, affected authority, and ReviewRecord bytes.');
  }
  return Object.freeze({ status: 'VERIFIED_BLOCK_AMENDMENT_CONTEXT', repository: context.repository,
    baseSha: context.baseSha, bSha: context.bSha, policyRevision: context.policyRevision,
    authorityId: context.authority.id, reviewRecordSha256: reviewDigest,
    amendmentRecordSha256: createHash('sha256').update(amendmentBytes).digest('hex'),
    tagObjectOid: tagResult.tagObjectOid });
}
