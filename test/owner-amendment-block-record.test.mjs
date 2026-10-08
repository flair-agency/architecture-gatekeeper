import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildOwnerAmendmentBlockRecord, validateOwnerAmendmentBlockRecord } from '../dist/owner-amendment-block-record.mjs';

const a = 'a'.repeat(40), h = 'b'.repeat(40), m = 'c'.repeat(40), d = 'd'.repeat(64);
const schema = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/ci-decision.schema.json', import.meta.url)));
const validation = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/decision.validation.json', import.meta.url)));
const context = { repository: 'flair-agency/example', prNumber: 7, baseSha: a, headSha: h, mergeSha: m,
  workflowSha: a, workflowPath: '.github/workflows/architecture-gate.yml', runId: '42', runAttempt: '2' };
const authority = { version: 1, selfRepository: context.repository, authorityRevision: a, manifestSha256: d, setDigest: 'e'.repeat(64),
  members: [{ id: 'architecture-contract', repository: context.repository, resolvedCommit: a,
    path: 'docs/architecture.md', byteLength: 1234, sha256: 'f'.repeat(64) }] };
const inputDigests = Object.fromEntries(['manifest', 'policy', 'prompt', 'schema', 'validation'].map(key => [key, d]));
const decision = { decision: 'BLOCK', findings: [], summary: 'The change weakens a required boundary.', authority: ['protected architecture'],
  authorityFiles: ['docs/architecture.md'], authorityIds: ['architecture-contract'], responsibility: ['acceptance'],
  capabilitySurface: ['CI'], qualityGuarantees: ['fail closed'], reviewedScope: ['change A'], prohibitedChanges: ['weaken gate'],
  gates: { sharedMechanism: { decision: 'BLOCK', summary: 'weakens validation', consumerOwnership: '', failClosedBehavior: '', compatibility: '', minimality: '' },
    trustBoundary: { decision: 'PASS', summary: 'credentials stay isolated', tokenPermissions: '', untrustedInputs: '', credentialHandling: '', reportingIsolation: '' } } };
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
const args = () => ({ decisionBytes, schema, validation, authority: structuredClone(authority), context: { ...context }, inputDigests: { ...inputDigests } });

test('builds deterministic bounded record with raw decision bytes and complete authority IDs', () => {
  const record = buildOwnerAmendmentBlockRecord({ decisionBytes, schema, validation, context: { ...context }, authority: structuredClone(authority), inputDigests: { ...inputDigests } });
  assert.equal(record.kind, 'owner-amendment-block-review-record');
  assert.equal(record.decisionBytesBase64, decisionBytes.toString('base64'));
  assert.equal(record.decisionSha256, createHash('sha256').update(decisionBytes).digest('hex'));
  assert.notEqual(record.decisionSha256, createHash('sha256').update(JSON.stringify(canonical(decision))).digest('hex'));
  assert.deepEqual(buildOwnerAmendmentBlockRecord(args()), record);
  assert.deepEqual(validateOwnerAmendmentBlockRecord({ ...args(), record, recordBytes: Buffer.from(`${JSON.stringify(record)}\n`) }), record);
});

test('validator rejects altered bytes, decision type, authority and context', () => {
  const record = buildOwnerAmendmentBlockRecord({ decisionBytes, schema, validation, context: { ...context }, authority: structuredClone(authority), inputDigests: { ...inputDigests } });
  assert.throws(() => validateOwnerAmendmentBlockRecord({ ...args(), record, decisionBytes: Buffer.from('{}') }));
  for (const edit of [
    x => { x.decisionBytes = Buffer.from(JSON.stringify(canonical({ ...decision, authorityIds: ['other'] }))); },
    x => { x.decisionBytes = Buffer.from(JSON.stringify(canonical({ ...decision, decision: 'PASS' }))); },
    x => { x.authority.members.push({ ...authority.members[0] }); },
    x => { x.inputDigests.unknown = d; },
    x => { x.context.baseSha = h; },
  ]) {
    const x = args(); edit(x);
    assert.throws(() => buildOwnerAmendmentBlockRecord(x));
  }
  assert.throws(() => validateOwnerAmendmentBlockRecord({ ...args(), record: { ...record, extra: true }, recordBytes: Buffer.from(`${JSON.stringify(record)}\n`) }), /unknown fields/);
});

test('rejects duplicate-key decision JSON and mismatched exact record bytes', () => {
  assert.throws(() => buildOwnerAmendmentBlockRecord({ decisionBytes: Buffer.from('{"decision":"BLOCK","decision":"PASS"}'), schema, validation,
    context: { ...context }, authority: structuredClone(authority), inputDigests: { ...inputDigests } }));
  const record = buildOwnerAmendmentBlockRecord({ decisionBytes, schema, validation, context: { ...context }, authority: structuredClone(authority), inputDigests: { ...inputDigests } });
  const recordBytes = Buffer.from(`${JSON.stringify(record)}\n`);
  assert.throws(() => validateOwnerAmendmentBlockRecord({ decisionBytes, schema, validation, context: { ...context }, authority: structuredClone(authority),
    inputDigests: { ...inputDigests }, record, recordBytes: Buffer.from(`${JSON.stringify(record)} `) }), /record bytes/);
});
