import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { composeOwnerAmendmentMergeGroupEvidence } from '../dist/owner-amendment-merge-group-evidence.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const bytes = v => Buffer.from(`${JSON.stringify(canonical(v))}\n`);
function fixture(mutate = () => {}) {
  const repository = 'flair-agency/architecture-gatekeeper', baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40);
  const path = 'docs/architecture.md', before = Buffer.from('old decision'), after = Buffer.from('new decision');
  const changes = [{ path, beforeSha256: hash(before), afterSha256: hash(after) }];
  const record = { version: 1, kind: 'owner-amendment-owner-initiated-amendment-record', triggerProfile: 'owner-initiated-self-v1', historicalTrigger: 'none', repository, baseSha, headSha: bSha, policyRevision: baseSha,
    authority: { id: 'architecture-contract', path, previousSha256: hash(before), newSha256: hash(after) }, changes, priorAuthoritySetDigest: '1'.repeat(64), resultingAuthoritySetDigest: '2'.repeat(64), purpose: 'Revise the existing decision' };
  const envelope = { version: 4, profile: 'self-g0', triggerProfile: 'owner-initiated-self-v1', historicalTrigger: 'none', bSha };
  mutate({ record, envelope });
  const recordBytes = bytes(record);
  Object.assign(envelope, { amendmentRecordBase64: recordBytes.toString('base64'), amendmentRecordSha256: hash(recordBytes) });
  const tagNamespace = 'refs/tags/architecture-gatekeeper/amendments', tagRef = `${tagNamespace}/${bSha}`, objectOid = 'c'.repeat(40);
  const gitContext = { repository, baseSha, headSha: bSha, policyBytes: Buffer.from('policy'), policy: { ownerAmendmentGrade: 'G0', ownerAmendmentScope: 'authority-only', ownerAmendmentTriggerProfile: 'owner-initiated-self-v1' }, scope: { authorityId: 'architecture-contract', authorityPath: path }, authorityBytes: { base: before, head: after }, changedFiles: [{ status: 'modified', path }], authorityChanges: [{ path, beforeBytes: before, afterBytes: after }], priorAuthoritySetDigest: '1'.repeat(64), resultingAuthoritySetDigest: '2'.repeat(64) };
  const calls = [];
  return { calls, result: () => composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha, bSha, tagNamespace, tagRef,
    resolveGitContext: () => gitContext,
    runGit(args) { calls.push(args); if (args.includes('--name-status')) return Buffer.from(`M\0${path}\0`); if (args.includes('--binary')) return Buffer.from('exact diff'); return args.at(-1).startsWith(baseSha) ? before : after; },
    readTag: async () => ({ status: 'READ_BACK_OWNER_AMENDMENT_TAG', repository, bSha, tagRef, observedTagRefOid: objectOid, tag: { objectOid, objectBytes: Buffer.concat([Buffer.from(`object ${bSha}\ntype commit\n\n`), bytes(envelope)]) } }),
    verifyEvidence() { throw new Error('historical evidence must not be invoked'); }, runGh() { throw new Error('historical attestation must not be invoked'); } }) };
}
test('v4 Queue evidence re-reads exact diff and blobs without historical evidence', async () => {
  const f = fixture(), result = await f.result();
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE', result.reason);
  assert.equal(result.historicalTrigger, 'none');
  for (const key of ['triggerDecision', 'reviewRecordSha256', 'attestationBundleSha256', 'producerRunId', 'producerRunAttempt']) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(f.calls.length, 4);
});
for (const [label, mutate] of [
  ['mixed envelope', ({ envelope }) => { envelope.reviewRecordBase64 = 'eA=='; }],
  ['mixed record', ({ record }) => { record.triggeringReviewSha256 = '3'.repeat(64); }],
  ['wrong version', ({ envelope }) => { envelope.version = 3; }],
  ['wrong target', ({ record }) => { record.authority.newSha256 = '3'.repeat(64); }],
  ['wrong Set', ({ record }) => { record.resultingAuthoritySetDigest = '3'.repeat(64); }],
]) test(`v4 Queue evidence rejects ${label}`, async () => {
  assert.equal((await fixture(mutate).result()).status, 'INCOMPLETE');
});
