import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { digestOwnerAmendmentRecord, verifyOwnerAmendmentG0 } from '../src/owner-amendment.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
const d = 'd'.repeat(40);
const oldDigest = '1'.repeat(64);
const newDigest = '2'.repeat(64);
const inputDigest = '3'.repeat(64);
const tagRef = 'refs/tags/architecture-gatekeeper/amendments/change-b';

function fixture() {
  const policy = {
    version: 1, repository: 'flair-agency/example', revision: a,
    ownerAmendment: { grade: 'G0', scope: 'authority-only', authorities: [{ id: 'architecture', path: 'docs/architecture.md' }] },
  };
  const current = {
    repository: policy.repository, baseSha: a, headSha: b, policyRevision: a,
    baseAuthority: { id: 'architecture', path: 'docs/architecture.md', sha256: oldDigest },
    headAuthority: { id: 'architecture', path: 'docs/architecture.md', sha256: newDigest },
    changedFiles: [{ path: 'docs/architecture.md', status: 'modified' }], tagRefOid: '',
  };
  const decision = { decision: 'BLOCK', authorityIds: ['architecture'] };
  const reviewRecord = {
    version: 1, repository: policy.repository, baseSha: a, headSha: c, policyRevision: a,
    authority: { ...current.baseAuthority }, reviewInputSha256: inputDigest,
    gatekeeperIdentity: 'architecture-gatekeeper@0.4.1',
    decision, decisionSha256: digestOwnerAmendmentRecord(decision),
  };
  const amendmentRecord = {
    version: 1, repository: policy.repository, baseSha: a, headSha: b, policyRevision: a,
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: oldDigest, newSha256: newDigest },
    triggeringReviewSha256: digestOwnerAmendmentRecord(reviewRecord), purpose: 'Adopt the owner-approved responsibility boundary',
  };
  const message = `${JSON.stringify({ version: 1, purpose: amendmentRecord.purpose,
    reviewRecordSha256: digestOwnerAmendmentRecord(reviewRecord),
    amendmentRecordSha256: digestOwnerAmendmentRecord(amendmentRecord) })}\n`;
  const objectBytes = Buffer.from(`object ${b}\ntype commit\ntag ${tagRef.slice('refs/tags/'.length)}\n` +
    `tagger Anyone <anyone@example.invalid> 1789990000 +0900\n\n${message}`);
  const objectOid = execFileSync('git', ['hash-object', '-t', 'tag', '--stdin'], { input: objectBytes, encoding: 'utf8' }).trim();
  current.tagRefOid = objectOid;
  const tag = { ref: tagRef, objectOid, objectBytes };
  return { policy, current, reviewRecord, amendmentRecord, tag };
}

function rejects(change, pattern) {
  const input = fixture();
  change(input);
  assert.throws(() => verifyOwnerAmendmentG0(input), pattern);
}

test('G0 accepts only exact authority-only B with a real annotated-tag object and no principal claim', () => {
  const input = fixture();
  const result = verifyOwnerAmendmentG0(input);
  assert.equal(result.label, 'OWNER_AMENDMENT / G0');
  assert.equal(result.principalAuthentication, 'not_verified');
  assert.equal(result.tagObjectOid, input.tag.objectOid);
  assert.equal(result.policyRevision, input.current.baseSha);
});

test('G0 requires explicit previous protected policy for affected authority and scope', () => {
  rejects(x => { x.policy.ownerAmendment.grade = 'G1'; }, /does not select G0/);
  rejects(x => { delete x.policy.ownerAmendment; }, /protected policy/);
  rejects(x => { x.policy.ownerAmendment.authorities = [{ id: 'other', path: 'docs/architecture.md' }]; }, /does not authorize/);
  rejects(x => { x.policy.ownerAmendment.scope = 'any'; }, /does not select G0/);
  rejects(x => { x.policy.revision = c; }, /previous protected policy revision/);
  rejects(x => { x.policy.ownerAmendment.extra = true; }, /missing or unknown/);
});

test('G0 rejects implementation files, rename, deletion and unchanged authority', () => {
  rejects(x => { x.current.changedFiles.push({ path: 'src/index.mjs', status: 'modified' }); }, /exactly one authority file/);
  rejects(x => { x.current.changedFiles[0].path = 'src/index.mjs'; }, /non-authority/);
  rejects(x => { x.current.changedFiles[0].status = 'renamed'; }, /non-authority/);
  rejects(x => { x.current.headAuthority.sha256 = oldDigest; }, /unchanged/);
  rejects(x => { x.current.headAuthority.path = 'docs/other.md'; }, /identities/);
});

test('G0 requires the exact historical BLOCK and old authority', () => {
  rejects(x => { x.reviewRecord.decision.decision = 'OWNER_DECISION'; }, /exact completed BLOCK/);
  rejects(x => { x.reviewRecord.decision.decision = 'PASS'; }, /exact completed BLOCK/);
  rejects(x => { x.reviewRecord.decisionSha256 = 'f'.repeat(64); }, /decision digest differs/);
  rejects(x => { x.reviewRecord.authority.sha256 = 'f'.repeat(64); }, /previous authority/);
  rejects(x => { x.reviewRecord.headSha = b; }, /separate historical change/);
  rejects(x => { x.amendmentRecord.triggeringReviewSha256 = 'f'.repeat(64); }, /exact BLOCK ReviewRecord/);
});

test('G0 rejects stale or unrelated B state and mismatched amendment content', () => {
  rejects(x => { x.current.headSha = d; }, /stale or belongs/);
  rejects(x => { x.current.baseSha = c; }, /previous protected policy revision/);
  rejects(x => { x.amendmentRecord.authority.newSha256 = 'f'.repeat(64); }, /authority binding/);
  rejects(x => { x.amendmentRecord.purpose = ''; }, /purpose/);
  rejects(x => { x.amendmentRecord.extra = true; }, /missing or unknown/);
});

test('G0 recomputes tag OID and validates current remote ref, target, tag name and annotation', () => {
  rejects(x => { x.tag.objectBytes = Buffer.from(x.tag.objectBytes.toString().replace(`object ${b}`, `object ${c}`)); }, /object OID is invalid/);
  rejects(x => { x.current.tagRefOid = c; }, /tag ref has changed/);
  rejects(x => { x.tag.objectOid = c; x.current.tagRefOid = c; }, /object OID is invalid/);
  rejects(x => { x.tag.ref = 'refs/tags/architecture-gatekeeper/amendments/other'; }, /header does not bind/);
  rejects(x => { x.tag.objectBytes = Buffer.from('garbage'); }, /object OID is invalid/);
  rejects(x => { x.tag.objectBytes = Buffer.alloc(8193); }, /missing or oversized/);
  rejects(x => { x.tag.extra = true; }, /missing or unknown/);
});

test('G0 checks tag payload even when its OID and ref are recomputed consistently', () => {
  const x = fixture();
  x.tag.objectBytes = Buffer.from(x.tag.objectBytes.toString().replace('owner-approved', 'author-claimed'));
  x.tag.objectOid = createHash('sha1').update(Buffer.from(`tag ${x.tag.objectBytes.length}\0`)).update(x.tag.objectBytes).digest('hex');
  x.current.tagRefOid = x.tag.objectOid;
  assert.throws(() => verifyOwnerAmendmentG0(x), /message does not bind/);
});
