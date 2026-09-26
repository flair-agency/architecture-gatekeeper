import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { verifyOwnerAdditionEligibilityProvenance } from '../src/github-owner-addition-provenance.mjs';

const sha = char => char.repeat(40);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const authorityMembers = [
  { id: 'architecture', repository: 'flair-agency/example', resolvedCommit: sha('a'), path: 'docs/architecture.md', byteLength: 25, sha256: 'e'.repeat(64) },
  { id: 'policy', repository: 'flair-agency/example', resolvedCommit: sha('a'), path: 'docs/policy.md', byteLength: 15, sha256: 'f'.repeat(64) },
];
const authoritySetDigest = digest(Buffer.from(JSON.stringify(authorityMembers)));
const policySha256 = '2'.repeat(64);
const gatekeeperWorkflow = { path: `flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml@${sha('3')}`, sha: sha('3') };
const authoritySet = { version: 2, selfRepository: 'flair-agency/example', authorityRevision: sha('a'), manifestSha256: '1'.repeat(64),
  setDigest: authoritySetDigest, members: authorityMembers };
const candidate = { repository: 'flair-agency/example', targetBranch: 'main', pullRequestNumber: 129,
  baseSha: sha('a'), bSha: sha('b'), syntheticSha: sha('c'), authoritySetDigest, authorityIds: ['architecture', 'policy'],
  runId: 9001, attempt: 2, jobId: 777, jobName: 'architecture-gate / owner-addition', callerPath: '.github/workflows/review.yml',
  procedure: { version: 2, repository: 'flair-agency/example', baseSha: sha('a'), headSha: sha('b'), policySha256, missingDecisionId: 'missing-choice',
    authoritySet },
  ordinary: { version: 2, decision: 'OWNER_DECISION', ownerDecisionId: 'missing-choice', summary: 'Missing prospective decision.',
    authoritySetDigest, authorityIds: ['architecture', 'policy'] },
  eligibility: { version: 2, authoritySetDigest, authorityIds: ['architecture', 'policy'],
    eligible: true, onlyMissingDecision: true, preservesExistingRules: true, noContradiction: true,
    noUnsupportedCompletionClaim: true, noUnrelatedUnresolvedChoices: true, matchesOrdinaryOwnerDecision: true },
  authoritySet,
  mergeAt: '2026-09-26T02:00:00.000Z' };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zipOne(name, bytes) {
  const compressed = deflateRawSync(bytes);
  const fileName = Buffer.from(name); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); local.writeUInt16LE(0x808, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(fileName.length, 26);
  const localPart = Buffer.concat([local, fileName, compressed]);
  const descriptor = Buffer.alloc(16); descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc32(bytes), 4);
  descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(bytes.length, 12);
  const archiveData = Buffer.concat([localPart, descriptor]);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x808, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc32(bytes), 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(fileName.length, 28);
  const directory = Buffer.concat([central, fileName]); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(archiveData.length, 16);
  return Buffer.concat([archiveData, directory, end]);
}
function encodedJson(value) { return Buffer.from(JSON.stringify(value)); }
function prepare() {
  const raw = {
    procedure: encodedJson(candidate.procedure), ordinaryDecision: encodedJson(candidate.ordinary),
    eligibilityDecision: encodedJson(candidate.eligibility), authoritySetProvenance: encodedJson(candidate.authoritySet),
  };
  const envelope = { version: 1, repository: candidate.repository, targetBranch: candidate.targetBranch,
    prNumber: candidate.pullRequestNumber, baseSha: candidate.baseSha, headSha: candidate.bSha,
    runId: candidate.runId, runAttempt: candidate.attempt,
    procedureBase64: raw.procedure.toString('base64'), ordinaryDecisionBase64: raw.ordinaryDecision.toString('base64'),
    eligibilityDecisionBase64: raw.eligibilityDecision.toString('base64'), authoritySetProvenanceBase64: raw.authoritySetProvenance.toString('base64'),
    digests: Object.fromEntries(Object.entries(raw).map(([key, bytes]) => [key, digest(bytes)])) };
  const evidenceBytes = encodedJson(envelope);
  const zip = zipOne('eligibility-evidence.json', evidenceBytes);
  const completedAt = '2026-09-26T01:00:00.000Z';
  const run = { id: candidate.runId, run_attempt: candidate.attempt, repository: { full_name: candidate.repository }, event: 'pull_request',
    status: 'completed', conclusion: 'success', path: `${candidate.callerPath}@refs/pull/${candidate.pullRequestNumber}/merge`, head_sha: candidate.syntheticSha,
    referenced_workflows: [{ ...gatekeeperWorkflow }],
    run_started_at: '2026-09-26T00:55:00.000Z', pull_requests: [{ number: candidate.pullRequestNumber,
      head: { sha: candidate.bSha }, base: { sha: candidate.baseSha, ref: candidate.targetBranch } }] };
  const job = { id: candidate.jobId, name: candidate.jobName, status: 'completed', conclusion: 'success',
    head_sha: candidate.syntheticSha, completed_at: completedAt,
    check_run_url: `https://api.github.com/repos/${candidate.repository}/check-runs/555` };
  const check = { id: 555, name: candidate.jobName, status: 'completed', conclusion: 'success', head_sha: candidate.syntheticSha,
    app: { id: 15368 } };
  const acceptName = candidate.jobName.replace(/\/ owner-addition$/, '/ accept');
  const acceptJob = { id: 778, name: acceptName, status: 'completed', conclusion: 'success',
    head_sha: candidate.syntheticSha, completed_at: '2026-09-26T01:03:00.000Z',
    check_run_url: `https://api.github.com/repos/${candidate.repository}/check-runs/556` };
  const acceptCheck = { id: 556, name: acceptName, status: 'completed', conclusion: 'success',
    head_sha: candidate.syntheticSha, app: { id: 15368 } };
  const artifact = { id: 987, name: `owner-addition-eligibility-evidence-${candidate.bSha}-${candidate.attempt}`, expired: false,
    size_in_bytes: zip.length, digest: `sha256:${digest(zip)}`, created_at: '2026-09-26T00:59:00.000Z',
    workflow_run: { id: candidate.runId, head_sha: candidate.syntheticSha } };
  const responses = new Map([
    [`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}`, run],
    [`/repos/${candidate.repository}/pulls/${candidate.pullRequestNumber}`, { number: candidate.pullRequestNumber,
      base: { ref: candidate.targetBranch }, head: { sha: candidate.bSha } }],
    [`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}/jobs?per_page=100`, { total_count: 2, jobs: [job, acceptJob] }],
    [`/repos/${candidate.repository}/check-runs/555`, check],
    [`/repos/${candidate.repository}/check-runs/556`, acceptCheck],
    [`/repos/${candidate.repository}/actions/runs/${candidate.runId}/artifacts?per_page=100`, { total_count: 1, artifacts: [artifact] }],
    [`/repos/${candidate.repository}/actions/artifacts/${artifact.id}/zip`, zip],
  ]);
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    const value = responses.get(path);
    if (!value) return { ok: false, status: 404 };
    if (Buffer.isBuffer(value)) return { ok: true, arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) };
    return { ok: true, json: async () => structuredClone(value) };
  };
  const args = { githubToken: 'token', repository: candidate.repository, targetBranch: candidate.targetBranch,
    pullRequestNumber: candidate.pullRequestNumber, baseSha: candidate.baseSha, bSha: candidate.bSha,
    callerPath: candidate.callerPath, jobName: candidate.jobName, appId: 15368, runId: candidate.runId,
    attempt: candidate.attempt, jobId: candidate.jobId, policySha256,
    expectedGatekeeperWorkflow: gatekeeperWorkflow,
    mergeAt: candidate.mergeAt, fetchImpl };
  return { args, responses, artifact, zip, raw };
}

test('verifies recorded-base run, producer, exact-B pre-merge artifact and returns API-derived provenance', async () => {
  const { args } = prepare();
  const result = await verifyOwnerAdditionEligibilityProvenance(args);
  assert.equal(result.status, 'verified');
  assert.equal(result.provenance.selection, 'recorded-base-policy');
  assert.deepEqual(result.provenance.workflow, { runId: '9001', attempt: 2, jobId: '777',
    workflowPath: candidate.callerPath, callerPath: candidate.callerPath });
  assert.equal(result.provenance.completedAt, '2026-09-26T01:00:00.000Z');
  assert.deepEqual(result.gatekeeperWorkflow, gatekeeperWorkflow);
  assert.deepEqual(result.artifacts.eligibilityDecision, candidate.eligibility);
  assert.equal(result.provenance.procedureDigest, result.artifacts.digests.procedure);
  assert.equal(result.provenance.eligibilityDigest, result.artifacts.digests.eligibilityDecision);
});

test('rejects wrong candidate, failed or late producer, wrong app, or mismatched artifact digest', async t => {
  const cases = [
    ['wrong workflow-associated B', f => { f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}`).pull_requests[0].head.sha = sha('9'); }],
    ['failed run', f => { f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}`).conclusion = 'failure'; }],
    ['wrong reusable workflow SHA', f => { f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}`).referenced_workflows[0].sha = sha('4'); }],
    ['duplicate reusable workflow identity', f => { f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}`).referenced_workflows.push({ ...gatekeeperWorkflow }); }],
    ['wrong job identity', f => { f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}/jobs?per_page=100`).jobs[0].name = 'other-job'; }],
    ['late producer', f => { f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}/jobs?per_page=100`).jobs[0].completed_at = candidate.mergeAt; }],
    ['wrong check-run app', f => { f.responses.get(`/repos/${candidate.repository}/check-runs/555`).app.id = 42; }],
    ['missing Gatekeeper accept job', f => { const page = f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}/jobs?per_page=100`); page.jobs.pop(); page.total_count = 1; }],
    ['failed Gatekeeper accept job', f => { f.responses.get(`/repos/${candidate.repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}/jobs?per_page=100`).jobs[1].conclusion = 'failure'; }],
    ['wrong Gatekeeper accept app', f => { f.responses.get(`/repos/${candidate.repository}/check-runs/556`).app.id = 42; }],
    ['wrong artifact bytes digest', f => { f.artifact.digest = `sha256:${'f'.repeat(64)}`; }],
    ['artifact after producer completion', f => { f.artifact.created_at = '2026-09-26T01:02:00.000Z'; }],
  ];
  for (const [label, mutate] of cases) await t.test(label, async () => {
    const f = prepare(); mutate(f);
    await assert.rejects(verifyOwnerAdditionEligibilityProvenance(f.args));
  });
});

test('rejects altered exact decision bytes and malformed or multi-entry ZIP archives', async () => {
  const f = prepare();
  f.args.eligibilityDigest = 'f'.repeat(64);
  await assert.rejects(verifyOwnerAdditionEligibilityProvenance(f.args), /eligibility decision bytes digest/);
  const wrongZip = zipOne('extra.txt', Buffer.from('x'));
  f.responses.set(`/repos/${candidate.repository}/actions/artifacts/${f.artifact.id}/zip`, wrongZip);
  f.artifact.size_in_bytes = wrongZip.length;
  f.artifact.digest = `sha256:${digest(wrongZip)}`;
  await assert.rejects(verifyOwnerAdditionEligibilityProvenance(f.args), /exact eligibility evidence file/);
});
