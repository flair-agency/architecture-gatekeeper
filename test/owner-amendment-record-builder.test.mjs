import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildOwnerAmendmentRecord } from '../src/owner-amendment-record-builder.mjs';

const baseSha = 'a'.repeat(40);
const bSha = 'b'.repeat(40);
const aSha = 'c'.repeat(40);
const previousSha256 = '1'.repeat(64);
const newSha256 = '2'.repeat(64);
const repository = 'flair-agency/architecture-gatekeeper';
const purpose = 'Update the self architecture contract for verified evidence handoff';
const attestationBundleBytes = Buffer.from('{"fixture":"verified attestation bundle"}\n');
const scope = Object.freeze({ baseSha, headSha: bSha, authorityId: 'architecture', authorityPath: 'docs/architecture.md',
  previousSha256, newSha256 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function reviewBytes(overrides = {}) {
  const decision = overrides.decision ?? { decision: 'BLOCK', authorityIds: ['architecture'] };
  const decisionBytes = Buffer.from(JSON.stringify(decision));
  const record = {
    version: 1,
    kind: 'owner-amendment-block-review-record',
    repository,
    prNumber: 42,
    baseSha,
    headSha: aSha,
    mergeSha: 'd'.repeat(40),
    workflowSha: baseSha,
    workflowPath: '.github/workflows/self-architecture-gate.yml',
    runId: '123',
    runAttempt: '1',
    authority: {
      version: 1,
      selfRepository: repository,
      authorityRevision: baseSha,
      manifestSha256: '3'.repeat(64),
      setDigest: '4'.repeat(64),
      members: [{ id: 'architecture', repository, resolvedCommit: baseSha, path: 'docs/architecture.md',
        byteLength: 20, sha256: previousSha256 }],
    },
    inputDigests: { manifest: '5'.repeat(64), policy: '6'.repeat(64), prompt: '7'.repeat(64), schema: '8'.repeat(64), validation: '9'.repeat(64) },
    decisionSha256: sha(decisionBytes),
    decisionBytesBase64: decisionBytes.toString('base64'),
    decision,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'decision')),
  };
  return Buffer.from(`${JSON.stringify(record)}\n`);
}

test('builds exact canonical self BLOCK AmendmentRecord v2 bytes bound to the verified evidence and B scope', () => {
  const sourceBytes = reviewBytes();
  const result = buildOwnerAmendmentRecord({ attestationBundleBytes, scope, reviewRecordBytes: sourceBytes, repository, purpose });
  const expected = {
    version: 2,
    repository,
    baseSha,
    headSha: bSha,
    policyRevision: baseSha,
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256, newSha256 },
    triggeringReviewSha256: sha(sourceBytes),
    attestationBundleSha256: sha(attestationBundleBytes),
    purpose,
  };
  assert.deepEqual(result.record, expected);
  assert.deepEqual(JSON.parse(result.bytes), expected);
  assert.equal(result.bytes.toString(), JSON.stringify(canonical(expected)));
  assert.equal(result.bytes.toString().includes('\n'), false);
  assert.equal(Object.isFrozen(result.record), true);
});

test('rejects ReviewRecord repository, base and B-head mismatches', async t => {
  const cases = [
    ['repository', { repository: 'other/project' }, /repository, base or historical head/],
    ['base', { baseSha: 'e'.repeat(40) }, /repository, base or historical head/],
    ['head equal to B', { headSha: bSha }, /repository, base or historical head/],
  ];
  for (const [name, changes, pattern] of cases) await t.test(name, () => {
    assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes, scope, reviewRecordBytes: reviewBytes(changes), repository, purpose }), pattern);
  });
});

test('rejects a BLOCK that cites another authority, repository or prior authority revision', async t => {
  const cases = [
    ['authority id', { authority: { ...JSON.parse(reviewBytes()).authority, members: [{ ...JSON.parse(reviewBytes()).authority.members[0], id: 'other' }] } }, /authority does not match/],
    ['authority path', { authority: { ...JSON.parse(reviewBytes()).authority, members: [{ ...JSON.parse(reviewBytes()).authority.members[0], path: 'docs/other.md' }] } }, /authority does not match/],
    ['prior authority digest', { authority: { ...JSON.parse(reviewBytes()).authority, members: [{ ...JSON.parse(reviewBytes()).authority.members[0], sha256: 'f'.repeat(64) }] } }, /authority does not match/],
    ['decision authority id', { decision: { decision: 'BLOCK', authorityIds: ['other'] } }, /authority does not match/],
  ];
  for (const [name, changes, pattern] of cases) await t.test(name, () => {
    assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes, scope, reviewRecordBytes: reviewBytes(changes), repository, purpose }), pattern);
  });
});

test('rejects non-BLOCK, tampered decision bytes, duplicate keys and malformed source bytes', async t => {
  const nonBlock = reviewBytes({ decision: { decision: 'PASS', authorityIds: ['architecture'] } });
  const tampered = JSON.parse(reviewBytes());
  tampered.decisionBytesBase64 = Buffer.from(JSON.stringify({ decision: 'PASS', authorityIds: ['architecture'] })).toString('base64');
  await t.test('non-BLOCK', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes, scope, reviewRecordBytes: nonBlock, repository, purpose }), /completed single-authority BLOCK/));
  await t.test('tampered bytes', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes, scope, reviewRecordBytes: Buffer.from(JSON.stringify(tampered)), repository, purpose }), /decision bytes or digest/));
  await t.test('duplicate keys', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes, scope, reviewRecordBytes: Buffer.from('{"version":1,"version":1}'), repository, purpose }), /duplicate/i));
  await t.test('malformed UTF-8', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes, scope, reviewRecordBytes: Buffer.from([0xff]), repository, purpose }), /UTF-8/));
});

test('requires exact bounded attestation bundle bytes', async t => {
  await t.test('missing', () => assert.throws(() => buildOwnerAmendmentRecord({ scope, reviewRecordBytes: reviewBytes(), repository, purpose }), /attestation bundle bytes are missing/));
  await t.test('oversized', () => assert.throws(() => buildOwnerAmendmentRecord({ scope, reviewRecordBytes: reviewBytes(), attestationBundleBytes: Buffer.alloc(65_537), repository, purpose }), /attestation bundle bytes are missing/));
});

test('rejects invalid scope, repository, or malformed purpose', async t => {
  await t.test('head and base coincide', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes,
    scope: { ...scope, headSha: baseSha }, reviewRecordBytes: reviewBytes(), repository, purpose,
  }), /inspected self scope is invalid/));
  await t.test('repository differs from ReviewRecord', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes,
    scope, reviewRecordBytes: reviewBytes(), repository: 'other/project', purpose,
  }), /repository, base or historical head/));
  await t.test('empty purpose', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes,
    scope, reviewRecordBytes: reviewBytes(), repository, purpose: '   ',
  }), /purpose/));
  await t.test('line breaks', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes,
    scope, reviewRecordBytes: reviewBytes(), repository, purpose: 'line one\nline two',
  }), /purpose/));
  await t.test('too long', () => assert.throws(() => buildOwnerAmendmentRecord({ attestationBundleBytes,
    scope, reviewRecordBytes: reviewBytes(), repository, purpose: 'x'.repeat(501),
  }), /purpose/));
});
