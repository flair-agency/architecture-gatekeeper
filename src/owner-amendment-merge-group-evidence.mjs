import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from './owner-amendment-handoff-git-context.mjs';
import { readOwnerAmendmentTagForMergeGroup } from './owner-amendment-tag-readback.mjs';
import { verifyOwnerAmendmentBlockEvidenceBundle } from './owner-amendment-block-evidence-composer.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Owner amendment merge-group evidence: ${message}`); };

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function parseTagEnvelope(tag, bSha) {
  const bytes = tag?.tag?.objectBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length > 262_144) fail('exact protected tag bytes are absent or oversized.');
  let source;
  try { source = decoder.decode(bytes); } catch { fail('protected tag bytes are not UTF-8.'); }
  const separator = source.indexOf('\n\n');
  if (separator < 0) fail('protected tag object has no message.');
  const message = source.slice(separator + 2);
  if (!message.endsWith('\n') || message.slice(0, -1).includes('\n')) fail('tag envelope must be one newline-terminated JSON line.');
  const json = message.slice(0, -1);
  let envelope;
  try { rejectDuplicateJsonKeys(json, 'tag evidence envelope'); envelope = JSON.parse(json); }
  catch { fail('tag evidence envelope JSON is invalid.'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      JSON.stringify(canonical(envelope)) !== json || envelope.version !== 2 || envelope.profile !== 'self-g0' || envelope.bSha !== bSha) {
    fail('tag evidence envelope is noncanonical or does not identify exact B.');
  }
  const decode = (encoded, digest, label, maximum) => {
    if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail(`${label} encoding is malformed.`);
    const data = Buffer.from(encoded, 'base64');
    if (!data.length || data.length > maximum || data.toString('base64') !== encoded || !SHA256.test(digest ?? '') || hash(data) !== digest) fail(`${label} bytes or digest are invalid.`);
    return data;
  };
  return { reviewRecordBytes: decode(envelope.reviewRecordBase64, envelope.reviewRecordSha256, 'ReviewRecord', 131_072),
    attestationBundleBytes: decode(envelope.attestationBundleBase64, envelope.attestationBundleSha256, 'attestation bundle', 65_536),
    amendmentRecordBytes: decode(envelope.amendmentRecordBase64, envelope.amendmentRecordSha256, 'AmendmentRecord', 8_192) };
}

function trustedContextFromGit(context) {
  const bytes = context?.authorityBytes;
  if (!Buffer.isBuffer(context?.policyBytes) || !Buffer.isBuffer(bytes?.base) || !Buffer.isBuffer(bytes?.head)) fail('resolved Git context lacks exact policy or authority bytes.');
  return Object.freeze({ repository: context.repository, baseSha: context.baseSha, bSha: context.headSha,
    policyRevision: context.baseSha,
    policy: Object.freeze({ grade: context.policy.ownerAmendmentGrade, scope: context.policy.ownerAmendmentScope,
      triggerProfile: context.policy.ownerAmendmentTriggerProfile,
      authorities: Object.freeze([{ id: context.scope.authorityId, path: context.scope.authorityPath }]) }),
    authority: Object.freeze({ id: context.scope.authorityId, path: context.scope.authorityPath,
      previousSha256: hash(bytes.base), newSha256: hash(bytes.head) }) });
}

function producerFromRecord(recordBytes, trusted) {
  let record;
  try { record = JSON.parse(decoder.decode(recordBytes)); } catch { fail('ReviewRecord is not valid UTF-8 JSON.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.repository !== trusted.repository ||
      record.baseSha !== trusted.baseSha || record.workflowSha !== trusted.baseSha ||
      record.workflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      typeof record.runId !== 'string' || !/^[1-9]\d*$/.test(record.runId) ||
      typeof record.runAttempt !== 'string' || !/^[1-9]\d*$/.test(record.runAttempt) ||
      record.inputDigests?.policy !== trusted.policySha256) fail('ReviewRecord producer, previous policy digest, or run identity is not bound to protected Git context.');
  return Object.freeze({ repository: trusted.repository, workflowPath: record.workflowPath,
    workflowSha: trusted.baseSha, workflowRef: 'refs/heads/main', runId: record.runId, runAttempt: record.runAttempt });
}

/**
 * Compose exact previous-base Git state, protected tag readback, and BLOCK
 * evidence verification for a merge-group candidate. The result contains only
 * verified eligibility inputs; this function never returns acceptance.
 */
export async function composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha, bSha, runGit,
  tagNamespace, tagRef, rulesetId, token, fetchImpl, readTagObject, runGh,
  resolveGitContext = resolveOwnerAmendmentHandoffGitContext,
  readTag = readOwnerAmendmentTagForMergeGroup,
  verifyEvidence = verifyOwnerAmendmentBlockEvidenceBundle } = {}) {
  try {
    if (!SHA1.test(baseSha ?? '') || !SHA1.test(bSha ?? '') || baseSha === bSha) fail('exact protected base and B commits are required.');
    if (tagRef !== `${tagNamespace}/${bSha}`) fail('tag ref does not identify exact B.');
    const gitContext = resolveGitContext({ repository, baseSha, headSha: bSha, runGit });
    const trustedContext = trustedContextFromGit(gitContext);
    const tag = await readTag({ repository, bSha, tagNamespace, tagRef, rulesetId, token, fetchImpl, readTagObject });
    if (tag.status !== 'READ_BACK_OWNER_AMENDMENT_TAG' || tag.repository !== repository || tag.bSha !== bSha || tag.tagRef !== tagRef) fail('protected tag readback does not bind this repository and exact B.');
    const tagEnvelope = { headSha: bSha, tag: tag.tag, tagRef, observedTagRefOid: tag.observedTagRefOid,
      ...parseTagEnvelope(tag, bSha) };
    const producerContext = producerFromRecord(tagEnvelope.reviewRecordBytes,
      { ...trustedContext, policySha256: hash(gitContext.policyBytes) });
    const evidence = verifyEvidence({ trustedContext, producerContext, tagEnvelope, runGh });
    if (evidence?.status !== 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE' || evidence.repository !== repository ||
        evidence.baseSha !== baseSha || evidence.bSha !== bSha || evidence.policyRevision !== baseSha ||
        evidence.tagObjectOid !== tag.tag.objectOid) fail(evidence?.reason ?? 'BLOCK evidence did not verify against exact Git and tag context.');
    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE', repository, baseSha, bSha,
      policyRevision: baseSha, policySha256: hash(gitContext.policyBytes),
      authorityId: trustedContext.authority.id, previousAuthoritySha256: trustedContext.authority.previousSha256,
      proposedAuthoritySha256: trustedContext.authority.newSha256,
      reviewRecordSha256: evidence.reviewRecordSha256, amendmentRecordSha256: evidence.amendmentRecordSha256,
      attestationBundleSha256: evidence.attestationBundleSha256, tagObjectOid: evidence.tagObjectOid,
      observedTagRefOid: tag.observedTagRefOid, producerRunId: producerContext.runId,
      producerRunAttempt: producerContext.runAttempt });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
