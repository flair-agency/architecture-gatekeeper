import { createHash } from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Owner amendment semantic producer: ${message}`); };

/** Parse the exact protected annotated-tag bytes emitted by the amendment handoff. */
export function parseOwnerAmendmentSemanticTagObject(objectBytes, { bSha, triggerProfile, tagRef } = {}) {
  if (!Buffer.isBuffer(objectBytes) || !objectBytes.length || objectBytes.length > 262_144 ||
      !/^[a-f0-9]{40}$/.test(bSha ?? '') ||
      !['completed-block-v1', 'completed-owner-decision-self-v1'].includes(triggerProfile) ||
      tagRef !== `refs/tags/architecture-gatekeeper/amendments/${bSha}`) {
    fail('tag object or exact protected profile binding is invalid.');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(objectBytes);
  const split = text.indexOf('\n\n');
  if (split < 0) fail('annotated tag object is malformed.');
  const [object, type, tag] = text.slice(0, split).split('\n');
  if (object !== `object ${bSha}` || type !== 'type commit' ||
      tag !== `tag ${tagRef.slice('refs/tags/'.length)}`) fail('annotated tag header does not bind exact B and protected ref.');
  const message = text.slice(split + 2);
  if (!message.endsWith('\n') || message.slice(0, -1).includes('\n')) fail('tag message is not a single JSON line.');
  const envelope = JSON.parse(message.slice(0, -1));
  const expectedKeys = ['version','profile','bSha','reviewRecordBase64','reviewRecordSha256','attestationBundleBase64',
    'attestationBundleSha256','amendmentRecordBase64','amendmentRecordSha256'];
  const ownerDecisionKeys = [...expectedKeys.slice(0, 2), 'triggerProfile', ...expectedKeys.slice(2)];
  const keys = triggerProfile === 'completed-block-v1' ? expectedKeys : ownerDecisionKeys;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).length !== keys.length || keys.some(key => !Object.hasOwn(envelope, key)) ||
      envelope.profile !== 'self-g0' || envelope.bSha !== bSha ||
      envelope.version !== (triggerProfile === 'completed-block-v1' ? 2 : 3) ||
      (triggerProfile !== 'completed-block-v1' && envelope.triggerProfile !== triggerProfile)) {
    fail('tag envelope does not select the previous-base trigger profile.');
  }
  const decode = (field, digestField, label, max) => {
    const value = envelope[field];
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      fail(`${label} base64 is malformed.`);
    }
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.length > max || bytes.toString('base64') !== value || sha256(bytes) !== envelope[digestField]) {
      fail(`${label} bytes/digest do not match.`);
    }
    return bytes;
  };
  return { envelope, reviewRecordBytes: decode('reviewRecordBase64', 'reviewRecordSha256', 'ReviewRecord', 131_072),
    attestationBundleBytes: decode('attestationBundleBase64', 'attestationBundleSha256', 'attestation bundle', 65_536),
    amendmentRecordBytes: decode('amendmentRecordBase64', 'amendmentRecordSha256', 'AmendmentRecord', 8_192) };
}
