import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { produceOwnerAmendmentOwnerDecision } from '../scripts/owner-amendment-owner-decision-producer.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40), mergeSha = 'c'.repeat(40);
const repository = 'flair-agency/architecture-gatekeeper';
const authorityBytes = Buffer.from('# Architecture\n');
const manifest = { version: 1, authorities: [{ id: 'architecture-contract', repository: 'self',
  revision: 'authority-revision', path: 'docs/architecture.md' }] };
const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
const descriptor = { id: 'architecture-contract', repository, resolvedCommit: baseSha,
  path: 'docs/architecture.md', byteLength: authorityBytes.length, sha256: sha(authorityBytes) };
const provenance = { version: 1, selfRepository: repository, authorityRevision: baseSha,
  manifestSha256: sha(manifestBytes), setDigest: sha(Buffer.from(JSON.stringify([descriptor]))), members: [descriptor] };
const limits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536,
  maxTotalBytes: 262144, maxPromptBytes: 524288 };
const amendment = { version: 1, grade: 'G0', scope: 'authority-only',
  triggerProfile: 'completed-owner-decision-self-v1', authorityId: 'architecture-contract',
  authorityPath: 'docs/architecture.md', evidenceProducer: 'github-actions-attestation',
  tagNamespace: 'refs/tags/architecture-gatekeeper/amendments' };
const selectedPolicy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
  mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium',
  authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
  ownerAmendment: amendment,
} } };
const baseInputs = { policy: Buffer.from(JSON.stringify(selectedPolicy)), manifest: manifestBytes,
  prompt: Buffer.from('review prompt'),
  schema: readFileSync(new URL('../.codex/gatekeeper/ci-decision.schema.json', import.meta.url)),
  validation: readFileSync(new URL('../.codex/gatekeeper/decision.validation.json', import.meta.url)) };
const decision = { decision: 'OWNER_DECISION', findings: [], summary: 'Existing decision needs owner review.',
  authority: ['architecture-contract'], authorityFiles: ['docs/architecture.md'], authorityIds: ['architecture-contract'],
  responsibility: ['owner decision'], capabilitySurface: ['review'], qualityGuarantees: ['fail closed'],
  reviewedScope: ['change A'], prohibitedChanges: ['self acceptance'],
  gates: { sharedMechanism: { decision: 'OWNER_DECISION', summary: 'Existing rule needs a choice.', consumerOwnership: '',
    failClosedBehavior: '', compatibility: '', minimality: '' }, trustBoundary: { decision: 'PASS', summary: 'No trust change.',
    tokenPermissions: '', untrustedInputs: '', credentialHandling: '', reportingIsolation: '' } } };
const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
const context = { repository, prNumber: 15, baseSha, headSha, mergeSha, workflowSha: baseSha,
  workflowPath: '.github/workflows/self-architecture-gate.yml', runId: '123', runAttempt: '1' };
const readAuthority = (revision, path) => {
  assert.equal(revision, baseSha); assert.equal(path, 'docs/architecture.md'); return authorityBytes;
};

test('produces exact OWNER_DECISION ReviewRecord only under the explicit previous-base self profile', () => {
  const record = produceOwnerAmendmentOwnerDecision({ decisionBytes, provenance, context, baseInputs, readAuthority });
  assert.equal(record.kind, 'owner-amendment-owner-decision-review-record');
  assert.equal(record.decision.decision, 'OWNER_DECISION');
  assert.equal(record.decision.ownerDecisionId, undefined);
  assert.equal(record.decisionBytesBase64, decisionBytes.toString('base64'));
  assert.deepEqual(record.authority.members, [descriptor]);
});

test('does not produce OWNER_DECISION evidence when the prior policy has no matching opt-in', () => {
  const unselected = structuredClone(baseInputs);
  const policy = structuredClone(selectedPolicy);
  delete policy.branches.main.ownerAmendment;
  unselected.policy = Buffer.from(JSON.stringify(policy));
  assert.throws(() => produceOwnerAmendmentOwnerDecision({ decisionBytes, provenance, context,
    baseInputs: unselected, readAuthority }), /OWNER_DECISION amendment profile is not selected/);
});

test('fails closed for incomplete or changed Authority Set provenance and non-OWNER_DECISION results', () => {
  const wrong = structuredClone(provenance);
  wrong.members[0].sha256 = 'f'.repeat(64);
  assert.throws(() => produceOwnerAmendmentOwnerDecision({ decisionBytes, provenance: wrong, context, baseInputs, readAuthority }), /differs from protected base bytes/);
  const pass = Buffer.from(`${JSON.stringify({ ...decision, decision: 'PASS' })}\n`);
  assert.throws(() => produceOwnerAmendmentOwnerDecision({ decisionBytes: pass, provenance, context, baseInputs, readAuthority }), /only a completed OWNER_DECISION/);
});
