import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseGithubMergeCommit, produceOwnerAmendmentBlock, validateRecordedContext } from '../scripts/owner-amendment-block-producer.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'buffer' });
const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const repository = 'flair-agency/architecture-gatekeeper';
const context = { repository, prNumber: 7, baseSha, headSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40),
  workflowSha: baseSha, workflowPath: '.github/workflows/architecture-gate.yml', runId: '42', runAttempt: '1' };
const event = { action: 'opened', repository: { full_name: repository }, pull_request: { number: 7, base: { ref: 'main', sha: baseSha }, head: { sha: context.headSha }, draft: false } };
const parents = [baseSha, context.headSha];
const workflowRef = `${repository}/${context.workflowPath}@refs/heads/main`;
const paths = { policy: '.codex/gatekeeper/ci-policy.json', prompt: '.codex/gatekeeper/ci-prompt.md',
  schema: '.codex/gatekeeper/ci-decision.schema.json', validation: '.codex/gatekeeper/decision.validation.json', manifest: '.codex/gatekeeper/authorities.json' };
const baseInputs = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, git('show', `${baseSha}:${p}`)]));
const authorityBytes = git('show', `${baseSha}:docs/architecture.md`);
const authorityMembers = [{ id: 'architecture-contract', repository, resolvedCommit: baseSha, path: 'docs/architecture.md', byteLength: authorityBytes.length, sha256: sha(authorityBytes) }];
const provenance = { version: 1, selfRepository: repository, authorityRevision: baseSha,
  manifestSha256: sha(baseInputs.manifest), setDigest: sha(Buffer.from(JSON.stringify(authorityMembers))), members: authorityMembers };
const decision = { decision: 'BLOCK', summary: 'A protected boundary is weakened.', authority: ['protected architecture'],
  authorityFiles: ['docs/architecture.md'], authorityIds: ['architecture-contract'], responsibility: ['acceptance'],
  capabilitySurface: ['CI'], qualityGuarantees: ['fail closed'], reviewedScope: ['change A'], prohibitedChanges: ['weaken gate'],
  gates: { sharedMechanism: { decision: 'BLOCK', summary: 'weakens validation', consumerOwnership: '', failClosedBehavior: '', compatibility: '', minimality: '' },
    trustBoundary: { decision: 'PASS', summary: 'credentials stay isolated', tokenPermissions: '', untrustedInputs: '', credentialHandling: '', reportingIsolation: '' } } };

test('accepts only merge context bound to the recorded protected base, head, and workflow', () => {
  assert.deepEqual(validateRecordedContext({ context, event, repository, workflowSha: baseSha, workflowRef, parents }), context);
  assert.throws(() => validateRecordedContext({ context, event, repository, workflowSha: 'd'.repeat(40), workflowRef, parents }));
  assert.throws(() => validateRecordedContext({ context, event, repository, workflowSha: baseSha, workflowRef, parents: [context.headSha, baseSha] }));
  assert.throws(() => validateRecordedContext({ context: { ...context, unknown: true }, event, repository, workflowSha: baseSha, workflowRef, parents }));
  assert.throws(() => validateRecordedContext({ context, event, repository, workflowSha: baseSha, workflowRef: `${repository}/.github/workflows/other.yml@refs/heads/main`, parents }));
});

test('accepts only the exact GitHub merge commit and two expected parent SHAs', () => {
  const response = JSON.stringify({ sha: context.mergeSha, parents: parents.map(value => ({ sha: value })) });
  assert.deepEqual(parseGithubMergeCommit(response, context.mergeSha), parents);
  assert.throws(() => parseGithubMergeCommit(response, 'd'.repeat(40)), /identity or parents/);
  assert.throws(() => parseGithubMergeCommit(JSON.stringify({ sha: context.mergeSha, parents: [parents[0]] }), context.mergeSha), /identity or parents/);
  assert.throws(() => parseGithubMergeCommit('{', context.mergeSha), /malformed/);
});

test('re-derives protected digests and builds deterministic BLOCK record from exact decision bytes', () => {
  const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
  const record = produceOwnerAmendmentBlock({ decisionBytes, provenance, context, baseInputs });
  assert.equal(record.kind, 'owner-amendment-block-review-record');
  assert.equal(record.decisionBytesBase64, decisionBytes.toString('base64'));
  assert.equal(record.inputDigests.schema, sha(baseInputs.schema));
  assert.deepEqual(produceOwnerAmendmentBlock({ decisionBytes, provenance, context, baseInputs }), record);
  assert.throws(() => produceOwnerAmendmentBlock({ decisionBytes: Buffer.from(JSON.stringify({ ...decision, decision: 'PASS' })), provenance, context, baseInputs }), /BLOCK/);
  const changed = { ...baseInputs, schema: Buffer.from('{}') };
  assert.notEqual(produceOwnerAmendmentBlock({ decisionBytes, provenance, context, baseInputs: changed }).inputDigests.schema, record.inputDigests.schema);
  const badProvenance = structuredClone(provenance); badProvenance.members[0].sha256 = 'e'.repeat(64);
  assert.throws(() => produceOwnerAmendmentBlock({ decisionBytes, provenance: badProvenance, context, baseInputs }), /Self authority/);
  const externalManifest = Buffer.from(JSON.stringify({ version: 1, authorities: [{ id: 'architecture-contract', repository: 'other/repo', revision: baseSha, path: 'docs/architecture.md' }] }));
  const externalProvenance = { ...provenance, manifestSha256: sha(externalManifest), members: [{ ...provenance.members[0], repository: 'other/repo' }] };
  assert.throws(() => produceOwnerAmendmentBlock({ decisionBytes, provenance: externalProvenance, context,
    baseInputs: { ...baseInputs, manifest: externalManifest } }), /External Authority Set/);
});
