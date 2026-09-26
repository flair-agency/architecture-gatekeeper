import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { digestOwnerDecisionAddition, validateOwnerDecisionAdditionG0Procedure } from '../src/owner-decision-addition.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const oldDigest = '1'.repeat(64);
const newDigest = '2'.repeat(64);
const tagRef = `refs/tags/architecture-owner-addition/${b}`;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function fixture() {
  const policy = {
    version: 1, repository: 'flair-agency/example', revision: a,
    ownerAddition: { grade: 'G0', authorityPath: 'docs/architecture.md' },
  };
  const current = {
    repository: policy.repository, baseSha: a, headSha: b, policyRevision: a,
    baseAuthority: { id: 'architecture', path: 'docs/architecture.md', sha256: oldDigest },
    headAuthority: { id: 'architecture', path: 'docs/architecture.md', sha256: newDigest },
    changedFiles: [{ path: 'docs/architecture.md', status: 'modified' }], tagRefOid: '',
  };
  const additionRecord = {
    version: 1, repository: policy.repository, baseSha: a, headSha: b, policyRevision: a,
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: oldDigest, newSha256: newDigest },
    missingDecision: { id: 'decision-17', summary: 'Choose who owns the new responsibility boundary' },
    purpose: 'Add the missing responsibility decision to canonical authority',
  };
  const objectBytes = Buffer.from(`object ${b}\ntype commit\ntag ${tagRef.slice('refs/tags/'.length)}\n` +
    'tagger Anyone <anyone@example.invalid> 1790000000 +0900\n\n' + `${JSON.stringify(canonical(additionRecord))}\n`);
  const objectOid = execFileSync('git', ['hash-object', '-t', 'tag', '--stdin'], { input: objectBytes, encoding: 'utf8' }).trim();
  current.tagRefOid = objectOid;
  const tag = { ref: tagRef, objectOid, objectBytes };
  return { policy, current, additionRecord, tag };
}

function rejects(change, pattern) {
  const input = fixture();
  change(input);
  assert.throws(() => validateOwnerDecisionAdditionG0Procedure(input), pattern);
}

function reencodeTag(input, update) {
  const parsed = JSON.parse(input.tag.objectBytes.toString().split('\n\n')[1]);
  update(parsed);
  input.tag.objectBytes = Buffer.from(input.tag.objectBytes.toString().split('\n\n')[0] + `\n\n${JSON.stringify(canonical(parsed))}\n`);
  input.tag.objectOid = execFileSync('git', ['hash-object', '-t', 'tag', '--stdin'], { input: input.tag.objectBytes, encoding: 'utf8' }).trim();
  input.current.tagRefOid = input.tag.objectOid;
}

test('validates G0 artifact bindings and makes no principal or semantic-eligibility claim', () => {
  const input = fixture();
  const result = validateOwnerDecisionAdditionG0Procedure(input);
  assert.equal(result.procedure, 'VALID_G0_OWNER_ADDITION');
  assert.equal(result.grade, 'G0');
  assert.equal(result.repository, input.current.repository);
  assert.equal(result.baseSha, a);
  assert.equal(result.headSha, b);
  assert.equal(result.policyRevision, a);
  assert.equal(result.authorityId, 'architecture');
  assert.equal(result.authorityPath, 'docs/architecture.md');
  assert.equal(result.previousAuthoritySha256, oldDigest);
  assert.equal(result.newAuthoritySha256, newDigest);
  assert.equal(result.missingDecisionId, 'decision-17');
  assert.equal(result.additionRecordSha256, digestOwnerDecisionAddition(input.additionRecord));
  assert.equal(result.tagRef, input.tag.ref);
  assert.equal(result.tagObjectOid, input.tag.objectOid);
  assert.equal(result.principalAuthentication, 'not_verified');
  assert.equal(result.semanticEligibility, 'requires_separate_protected_review');
  assert.equal(Object.hasOwn(result, 'result'), false);
});

test('requires an explicit previous protected G0 policy for the exact authority path', () => {
  rejects(x => { x.policy.ownerAddition.grade = 'G1'; }, /does not select G0/);
  rejects(x => { delete x.policy.ownerAddition; }, /previous protected policy/);
  rejects(x => { x.policy.ownerAddition.authorityPath = 'docs/other.md'; }, /does not authorize/);
  rejects(x => { x.policy.ownerAddition.extra = true; }, /missing or unknown/);
  rejects(x => { x.policy.revision = 'c'.repeat(40); }, /base, head or previous protected policy revision/);
});

test('limits B to one modified authority file with changed exact bytes', () => {
  rejects(x => { x.current.changedFiles.push({ path: 'src/runtime.mjs', status: 'modified' }); }, /exactly one authority file/);
  rejects(x => { x.current.changedFiles[0].path = 'src/runtime.mjs'; }, /non-authority/);
  rejects(x => { x.current.changedFiles[0].status = 'renamed'; }, /non-authority/);
  rejects(x => { x.current.headAuthority.sha256 = oldDigest; }, /unchanged/);
  rejects(x => { x.current.headAuthority.path = 'docs/other.md'; }, /identity or bytes/);
});

test('rejects stale changes and mismatched authority or policy bindings in the tag record', () => {
  rejects(x => { x.current.headSha = 'c'.repeat(40); }, /header does not bind/);
  rejects(x => { x.current.baseSha = 'c'.repeat(40); }, /base, head or previous protected policy revision/);
  rejects(x => { reencodeTag(x, record => { record.authority.newSha256 = 'f'.repeat(64); }); }, /authority binding/);
  rejects(x => { reencodeTag(x, record => { record.policyRevision = 'f'.repeat(40); }); }, /stale or belongs/);
  rejects(x => { reencodeTag(x, record => { record.purpose = ''; }); }, /purpose/);
  rejects(x => { reencodeTag(x, record => { record.extra = true; }); }, /missing or unknown/);
});

test('requires a valid OWNER_ADDITION annotated tag object bound to B and observed OID', () => {
  rejects(x => { x.tag.objectBytes = Buffer.from(x.tag.objectBytes.toString().replace(`object ${b}`, `object ${a}`)); }, /OID is invalid/);
  rejects(x => { x.current.tagRefOid = 'c'.repeat(40); }, /ref has changed/);
  rejects(x => { x.tag.ref = `refs/tags/architecture-owner-addition/${a}`; }, /header does not bind/);
  rejects(x => { x.tag.objectBytes = Buffer.from('not an annotated tag'); }, /OID is invalid/);
  rejects(x => { x.tag.objectBytes = Buffer.alloc(8_193); }, /missing or oversized/);
  rejects(x => { x.tag.extra = true; }, /missing or unknown/);
  rejects(x => { reencodeTag(x, record => { record.version = 2; }); }, /stale or belongs/);
});

test('does not infer semantic truth from the tagged missing-decision claim', () => {
  const input = fixture();
  reencodeTag(input, record => { record.missingDecision.summary = 'Migration is complete and verified'; });
  const result = validateOwnerDecisionAdditionG0Procedure(input);
  assert.equal(result.semanticEligibility, 'requires_separate_protected_review');
});
