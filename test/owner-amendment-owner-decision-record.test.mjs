import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildOwnerAmendmentOwnerDecisionRecord, validateOwnerAmendmentOwnerDecisionRecord } from '../src/owner-amendment-owner-decision-record.mjs';

const base = 'a'.repeat(40), head = 'b'.repeat(40), merge = 'c'.repeat(40), digest = 'd'.repeat(64);
const schema = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/ci-decision.schema.json', import.meta.url)));
const validation = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/decision.validation.json', import.meta.url)));
const context = { repository: 'flair-agency/example', prNumber: 17, baseSha: base, headSha: head, mergeSha: merge,
  workflowSha: base, workflowPath: '.github/workflows/architecture-gate.yml', runId: '123', runAttempt: '1' };
const members = [
  { id: 'architecture', repository: context.repository, resolvedCommit: base, path: 'docs/architecture.md', byteLength: 1200, sha256: '1'.repeat(64) },
  { id: 'policy', repository: context.repository, resolvedCommit: base, path: '.codex/policy.md', byteLength: 600, sha256: '2'.repeat(64) },
];
const authority = { version: 1, selfRepository: context.repository, authorityRevision: base,
  manifestSha256: 'e'.repeat(64), setDigest: createHash('sha256').update(JSON.stringify(members)).digest('hex'), members };
const inputDigests = Object.fromEntries(['manifest', 'policy', 'prompt', 'schema', 'validation'].map(key => [key, digest]));
const decision = { decision: 'OWNER_DECISION', findings: [], summary: 'An existing decision needs owner review.',
  authority: ['architecture', 'policy'], authorityFiles: ['docs/architecture.md', '.codex/policy.md'],
  authorityIds: ['architecture', 'policy'], responsibility: ['owner decision'], capabilitySurface: ['review'],
  qualityGuarantees: ['preserve protected policy'], reviewedScope: ['change A'], prohibitedChanges: ['self acceptance'],
  gates: { sharedMechanism: { decision: 'OWNER_DECISION', summary: 'Existing rule needs a choice.', consumerOwnership: '', failClosedBehavior: '', compatibility: '', minimality: '' },
    trustBoundary: { decision: 'PASS', summary: 'No trust change.', tokenPermissions: '', untrustedInputs: '', credentialHandling: '', reportingIsolation: '' } } };
const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
const args = () => ({ decisionBytes, schema, validation, authority: structuredClone(authority), context: { ...context }, inputDigests: { ...inputDigests } });

test('builds a versioned OWNER_DECISION record from exact protected inputs and the complete Authority Set', () => {
  const record = buildOwnerAmendmentOwnerDecisionRecord(args());
  assert.equal(record.kind, 'owner-amendment-owner-decision-review-record');
  assert.equal(record.version, 1);
  assert.equal(record.decision.decision, 'OWNER_DECISION');
  assert.equal(Object.hasOwn(record, 'eligibility'), false);
  assert.equal(Object.hasOwn(record, 'ownerApproval'), false);
  assert.deepEqual(record.authority.members.map(member => member.id), ['architecture', 'policy']);
  assert.equal(record.decisionBytesBase64, decisionBytes.toString('base64'));
  assert.equal(record.decisionSha256, createHash('sha256').update(decisionBytes).digest('hex'));
  assert.deepEqual(validateOwnerAmendmentOwnerDecisionRecord({ ...args(), record,
    recordBytes: Buffer.from(`${JSON.stringify(record)}\n`) }), record);
});

test('rejects BLOCK, PASS, and missing-decision confusion or incomplete Authority Set results', () => {
  for (const wrongDecision of ['BLOCK', 'PASS']) {
    const x = args();
    x.decisionBytes = Buffer.from(JSON.stringify({ ...decision, decision: wrongDecision }));
    assert.throws(() => buildOwnerAmendmentOwnerDecisionRecord(x), /only a completed OWNER_DECISION/);
  }
  const incomplete = args();
  incomplete.decisionBytes = Buffer.from(JSON.stringify({ ...decision, authorityIds: ['architecture'] }));
  assert.throws(() => buildOwnerAmendmentOwnerDecisionRecord(incomplete), /complete Authority ID set/);
});

test('rejects stale or changed review context, authority provenance, and protected input digests', () => {
  for (const change of [
    x => { x.context.workflowSha = head; },
    x => { x.context.baseSha = head; },
    x => { x.authority.authorityRevision = head; },
    x => { x.authority.members.pop(); },
    x => { x.inputDigests.policy = '0'.repeat(64); x.inputDigests.extra = digest; },
  ]) {
    const x = args(); change(x);
    assert.throws(() => buildOwnerAmendmentOwnerDecisionRecord(x));
  }
});

test('rejects an Authority Set digest that does not match its ordered member descriptors', () => {
  const x = args();
  x.authority.setDigest = 'f'.repeat(64);
  assert.throws(() => buildOwnerAmendmentOwnerDecisionRecord(x), /set digest does not match the ordered member descriptors/);
});

test('rejects a same-repository authority member not pinned to the protected review base', () => {
  const x = args();
  x.authority.members[0].resolvedCommit = head;
  x.authority.setDigest = createHash('sha256').update(JSON.stringify(x.authority.members)).digest('hex');
  assert.throws(() => buildOwnerAmendmentOwnerDecisionRecord(x), /same-repository authority member is not from the protected review base/);
});

test('case-insensitively binds a same-repository member to the protected review base', () => {
  const x = args();
  x.authority.members[0].repository = 'Flair-Agency/Example';
  x.authority.members[0].resolvedCommit = head;
  x.authority.setDigest = createHash('sha256').update(JSON.stringify(x.authority.members)).digest('hex');
  assert.throws(() => buildOwnerAmendmentOwnerDecisionRecord(x), /same-repository authority member is not from the protected review base/);
});

test('validator requires the distinct record kind and byte-for-byte rebuilt record', () => {
  const record = buildOwnerAmendmentOwnerDecisionRecord(args());
  const recordBytes = Buffer.from(`${JSON.stringify(record)}\n`);
  assert.throws(() => validateOwnerAmendmentOwnerDecisionRecord({ ...args(), record: { ...record, kind: 'owner-amendment-block-review-record' }, recordBytes }), /kind is invalid/);
  assert.throws(() => validateOwnerAmendmentOwnerDecisionRecord({ ...args(), record, recordBytes: Buffer.from(`${JSON.stringify(record)} `) }), /exact validated producer inputs/);
  const wrongRecord = { ...record, decision: { ...decision, decision: 'BLOCK' } };
  assert.throws(() => validateOwnerAmendmentOwnerDecisionRecord({ ...args(), record: wrongRecord, recordBytes }), /ReviewRecord bytes differ/);
});

test('rejects duplicate keys and tampered decision bytes', () => {
  const duplicate = args();
  duplicate.decisionBytes = Buffer.from('{"decision":"OWNER_DECISION","decision":"BLOCK"}');
  assert.throws(() => buildOwnerAmendmentOwnerDecisionRecord(duplicate), /duplicate/i);
  const tampered = args();
  tampered.decisionBytes = Buffer.from(JSON.stringify({ ...decision, summary: 'Different decision bytes.' }));
  const rebuilt = buildOwnerAmendmentOwnerDecisionRecord(tampered);
  assert.equal(rebuilt.decisionSha256, createHash('sha256').update(tampered.decisionBytes).digest('hex'));
  assert.notEqual(rebuilt.decisionSha256, createHash('sha256').update(decisionBytes).digest('hex'));
});
