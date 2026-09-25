import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { materializeAuthoritySet } from '../src/authority-set.mjs';
import { buildRealPrBlockRecord } from '../scripts/issue83-real-pr-block-probe.mjs';
import { inspectHistoricalBlock } from '../scripts/issue83-offline-block-verifier.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const paths = { policy: '.codex/gatekeeper/ci-policy.json', prompt: '.codex/gatekeeper/ci-prompt.md',
  schema: '.codex/gatekeeper/ci-decision.schema.json', validation: '.codex/gatekeeper/decision.validation.json',
  manifest: '.codex/gatekeeper/authorities.json' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'issue83-verifier-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  for (const path of [...Object.values(paths), 'docs/architecture.md']) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(new URL(`../${path}`, import.meta.url), target);
  }
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'protected base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'change.txt'), 'test fixture\n');
  git(root, 'add', 'change.txt'); git(root, 'commit', '-qm', 'PR head');
  const headSha = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const mergeSha = git(root, 'commit-tree', tree, '-p', baseSha, '-p', headSha, '-m', 'reviewed merge');
  const expected = { repository, prNumber: 123, baseSha, headSha, mergeSha, workflowSha: baseSha,
    workflowPath: '.github/workflows/issue83-real-pr-block-probe.yml', runId: '42', runAttempt: '2' };
  const current = { repository, prNumber: 123, baseRef: 'main', baseSha, headSha, mergeSha, draft: false };
  const inputs = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(join(root, path))]));
  const inputDigests = Object.fromEntries(Object.entries(inputs).map(([key, bytes]) => [key, hash(bytes)]));
  const policy = JSON.parse(inputs.policy);
  const set = await materializeAuthoritySet({ manifestBytes: inputs.manifest,
    limits: policy.branches.main.authorityLimits, selfRepository: repository, selfRoot: root,
    authorityRevision: baseSha });
  const authority = { version: 1, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: set.manifestSha256, setDigest: set.setDigest,
    members: set.members.map(({ id, repository, resolvedCommit, path, byteLength, sha256 }) =>
      ({ id, repository, resolvedCommit, path, byteLength, sha256 })) };
  const decision = { decision: 'BLOCK', summary: 'Weakens fail-closed behavior', authority: ['protected architecture'],
    authorityFiles: ['docs/architecture.md'], authorityIds: ['architecture-contract'],
    responsibility: ['acceptance'], capabilitySurface: ['CI'], qualityGuarantees: ['fail closed'],
    reviewedScope: ['fixture'], prohibitedChanges: ['accept timeout'], gates: {
      sharedMechanism: { decision: 'BLOCK', summary: 'timeout accepted', consumerOwnership: '',
        failClosedBehavior: '', compatibility: '', minimality: '' },
      trustBoundary: { decision: 'PASS', summary: 'credentials isolated', tokenPermissions: '',
        untrustedInputs: '', credentialHandling: '', reportingIsolation: '' },
    } };
  const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
  const { workflowPath, ...context } = expected;
  const record = buildRealPrBlockRecord({ decision, decisionBytes, context, provenance: authority,
    inputDigests, schema: JSON.parse(inputs.schema), validation: JSON.parse(inputs.validation) });
  const recordBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const uri = `https://github.com/${repository}/${workflowPath}@refs/heads/main`;
  const verified = [{ verificationResult: { signature: { certificate: {
    subjectAlternativeName: uri, buildSignerURI: uri, buildConfigURI: uri,
    githubWorkflowRepository: repository, githubWorkflowSHA: baseSha,
    buildSignerDigest: baseSha, buildConfigDigest: baseSha, sourceRepositoryDigest: baseSha,
    sourceRepositoryURI: `https://github.com/${repository}`, sourceRepositoryRef: 'refs/heads/main',
    githubWorkflowTrigger: 'pull_request_target',
    runInvocationURI: `https://github.com/${repository}/actions/runs/42/attempts/2`,
  } }, statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{
    name: 'issue83-real-pr-block-record.json', digest: { sha256: hash(recordBytes) },
  }] } } }];
  return { expected, current, recordBytes, verified, gitRoot: root };
}

test('independent test-only inspection reconstructs exact protected BLOCK record', async t => {
  const data = await fixture(t);
  assert.equal((await inspectHistoricalBlock(data)).status, 'VERIFIED_TEST_ONLY_BLOCK');
});

test('edited bytes, wrong signer or attempt, absent evidence, and stale PR state are incomplete', async t => {
  const data = await fixture(t);
  const cases = [
    { ...data, recordBytes: Buffer.from(data.recordBytes.toString().replace('accept timeout', 'accept outage')) },
    { ...data, verified: [{ verificationResult: { ...data.verified[0].verificationResult,
      signature: { certificate: { ...data.verified[0].verificationResult.signature.certificate,
        subjectAlternativeName: 'https://github.com/other/repo/.github/workflows/other.yml@refs/heads/main' } } } }] },
    { ...data, expected: { ...data.expected, runAttempt: '3' } },
    { ...data, verified: [] },
    { ...data, recordBytes: undefined },
    { ...data, current: { ...data.current, headSha: 'a'.repeat(40) } },
  ];
  for (const value of cases) assert.equal((await inspectHistoricalBlock(value)).status, 'INCOMPLETE');
});

test('protected input drift and incomplete decision are incomplete', async t => {
  const data = await fixture(t);
  const edited = JSON.parse(data.recordBytes);
  edited.inputDigests.policy = 'f'.repeat(64);
  assert.equal((await inspectHistoricalBlock({ ...data, recordBytes: Buffer.from(`${JSON.stringify(edited, null, 2)}\n`) })).status, 'INCOMPLETE');
  const incomplete = JSON.parse(data.recordBytes);
  incomplete.decision.decision = 'OWNER_DECISION';
  assert.equal((await inspectHistoricalBlock({ ...data, recordBytes: Buffer.from(`${JSON.stringify(incomplete, null, 2)}\n`) })).status, 'INCOMPLETE');
});
