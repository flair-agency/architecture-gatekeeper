import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { digestOwnerDecisionAddition } from '../../dist/owner-decision-addition.mjs';

const sha = char => char.repeat(40);
const hex = char => char.repeat(64);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));

// The production provenance verifier intentionally owns strict ZIP decoding.
// This minimal single-entry writer is duplicated from the focused provenance
// test because its builder is private there; no production implementation is copied.
function zipOne(name, bytes) {
  const compressed = deflateRawSync(bytes);
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x808, 6);
  local.writeUInt16LE(8, 8); local.writeUInt16LE(fileName.length, 26);
  const localPart = Buffer.concat([local, fileName, compressed]);
  const crc = (() => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return (value ^ 0xffffffff) >>> 0;
  })();
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(bytes.length, 12);
  const archiveData = Buffer.concat([localPart, descriptor]);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x808, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const directory = Buffer.concat([central, fileName]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(archiveData.length, 16);
  return Buffer.concat([archiveData, directory, end]);
}

export function ownerAdditionFinalizeFixture({ scenario = 'success' } = {}) {
  const repository = 'flair-agency/example';
  const baseSha = sha('a'); const bSha = sha('b'); const mergeSha = sha('c');
  const targetSha = sha('d'); const treeSha = sha('e'); const runId = '9001'; const attempt = 2;
  const callerPath = '.github/workflows/review.yml';
  const workflowPath = '.github/workflows/architecture-gate.yml';
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const authorityPath = 'docs/architecture.md';
  const ownerPromptPath = '.codex/gatekeeper/owner-addition-prompt.md';
  const ownerSchemaPath = '.codex/gatekeeper/owner-addition.schema.json';
  const ordinaryPromptPath = '.codex/gatekeeper/prompt.md';
  const ordinarySchemaPath = '.codex/gatekeeper/schema.json';
  const tagObjectOid = sha('f');
  const authorityBytes = Buffer.from('synthetic proposed authority\n');
  const baseAuthorityBytes = Buffer.from('synthetic base authority\n');
  const policy = { version: 5, default: { mode: 'local-only' }, branches: { main: {
    mode: 'procedural', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimits: { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 262144, maxTotalBytes: 524288, maxPromptBytes: 1048576 },
    ownerAddition: { version: 2, grade: 'G0', authorityId: 'architecture', authorityPath,
      promptPath: ownerPromptPath, schemaPath: ownerSchemaPath },
    adoptionEvidence: { producer: 'github-actions', workflowPath: callerPath, jobName: 'architecture-gate / owner-addition' },
  } } };
  const policyBytes = json(policy);
  const members = [
    { id: 'architecture', repository, resolvedCommit: baseSha, path: authorityPath,
      byteLength: baseAuthorityBytes.length, sha256: digest(baseAuthorityBytes) },
    { id: 'policy', repository, resolvedCommit: baseSha, path: 'docs/policy.md', byteLength: 15, sha256: hex('6') },
  ];
  const authoritySet = { version: 2, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: hex('1'), setDigest: digest(json(members)), members };
  const additionRecord = { version: 2, repository, baseSha, headSha: bSha, policyRevision: baseSha,
    policySha256: digest(policyBytes), authoritySet: { manifestSha256: authoritySet.manifestSha256, setDigest: authoritySet.setDigest },
    authority: { id: 'architecture', path: authorityPath, previousSha256: members[0].sha256, newSha256: digest(authorityBytes) },
    missingDecision: { id: 'missing-choice' }, purpose: 'Add a missing decision.' };
  const additionRecordSha256 = digestOwnerDecisionAddition(additionRecord);
  const procedure = { version: 2, repository, baseSha, headSha: bSha, policySha256: digest(policyBytes),
    missingDecisionId: 'missing-choice', authorityId: 'architecture', authorityPath, newAuthoritySha256: digest(authorityBytes),
    tagObjectOid, tagRef: `refs/tags/architecture-owner-addition/${bSha}`,
    additionRecordSha256, authoritySet };
  const ordinaryDecision = { version: 2, decision: 'OWNER_DECISION', ownerDecisionId: 'missing-choice',
    authoritySetDigest: authoritySet.setDigest, authorityIds: ['architecture', 'policy'] };
  const eligibilityDecision = { version: 2, authoritySetDigest: authoritySet.setDigest,
    authorityIds: ['architecture', 'policy'], eligible: true, onlyMissingDecision: true,
    preservesExistingRules: true, noContradiction: true, noUnsupportedCompletionClaim: true,
    noUnrelatedUnresolvedChoices: true, matchesOrdinaryOwnerDecision: true };
  const data = {
    procedure: json(procedure), ordinaryDecision: json(ordinaryDecision),
    eligibilityDecision: json(eligibilityDecision), authoritySetProvenance: json(authoritySet),
  };
  const envelope = { version: 1, repository, targetBranch: 'main', prNumber: 129, baseSha, headSha: bSha,
    runId: Number(runId), runAttempt: attempt,
    procedureBase64: data.procedure.toString('base64'), ordinaryDecisionBase64: data.ordinaryDecision.toString('base64'),
    eligibilityDecisionBase64: data.eligibilityDecision.toString('base64'),
    authoritySetProvenanceBase64: data.authoritySetProvenance.toString('base64'),
    digests: Object.fromEntries(Object.entries(data).map(([name, bytes]) => [name, digest(bytes)])) };
  const zip = zipOne('eligibility-evidence.json', json(envelope));
  const artifactDigest = `sha256:${digest(zip)}`;
  const workflowSha = sha('7');
  const callerWorkflow = Buffer.from(`jobs:\n  architecture-gate:\n    uses: flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml@${workflowSha}\n`);
  const reusableWorkflow = Buffer.from(`name: Architecture Gate\non:\n  workflow_call:\n    inputs:\n      policy-path:\n        type: string\n        default: ${policyPath}\n      prompt-path:\n        type: string\n        default: ${ordinaryPromptPath}\n      schema-path:\n        type: string\n        default: ${ordinarySchemaPath}\n      validation-path:\n        type: string\n        default: ''\n`);
  const checkUrl = `https://api.github.com/repos/${repository}/check-runs/555`;
  const run = { id: Number(runId), run_attempt: attempt, repository: { full_name: repository }, event: 'pull_request',
    status: 'completed', conclusion: 'success', path: `${callerPath}@refs/pull/129/merge`, head_sha: sha('8'),
    referenced_workflows: [{ path: `flair-agency/architecture-gatekeeper/${workflowPath}@${workflowSha}`, sha: workflowSha }],
    run_started_at: '2026-09-26T00:55:00.000Z', pull_requests: [{ number: 129,
      head: { sha: bSha }, base: { sha: baseSha, ref: 'main' } }] };
  const jobs = { total_count: 2, jobs: [
    { id: 777, name: 'architecture-gate / owner-addition', status: 'completed', conclusion: 'success', head_sha: sha('8'),
      completed_at: '2026-09-26T01:00:00.000Z', check_run_url: checkUrl,
      steps: [
        { name: 'Preserve exact v5 pre-merge eligibility evidence', status: 'completed', conclusion: 'success', number: 7,
          started_at: '2026-09-26T00:58:30.000Z', completed_at: '2026-09-26T00:59:30.000Z' },
        { name: 'Record exact uploaded eligibility artifact binding', status: 'completed', conclusion: 'success', number: 8,
          started_at: '2026-09-26T00:59:30.000Z', completed_at: '2026-09-26T00:59:31.000Z' },
      ] },
    { id: 778, name: 'architecture-gate / accept', status: 'completed', conclusion: 'success', head_sha: sha('8'),
      completed_at: '2026-09-26T01:03:00.000Z', check_run_url: `https://api.github.com/repos/${repository}/check-runs/556`, steps: [] },
  ] };
  const artifact = { id: 987, name: `owner-addition-eligibility-evidence-${bSha}-${attempt}`, expired: false,
    size_in_bytes: zip.length, digest: artifactDigest, created_at: '2026-09-26T00:59:00.000Z',
    workflow_run: { id: Number(runId), head_sha: sha('8') } };
  const values = new Map();
  const contents = new Map();
  const addContent = (repo, path, ref, bytes) => contents.set(`/repos/${repo}/contents/${path}?ref=${ref}`, {
    type: 'file', encoding: 'base64', content: Buffer.from(bytes).toString('base64'),
  });
  const targetPaths = [policyPath, ownerPromptPath, ownerSchemaPath, ordinaryPromptPath, ordinarySchemaPath];
  for (const path of targetPaths) addContent(repository, path, baseSha,
    path === policyPath ? policyBytes : Buffer.from(`synthetic ${path}\n`));
  addContent(repository, callerPath, baseSha, callerWorkflow);
  addContent('flair-agency/architecture-gatekeeper', workflowPath, workflowSha, reusableWorkflow);
  addContent(repository, authorityPath, bSha, authorityBytes);
  addContent(repository, authorityPath, targetSha, authorityBytes);
  values.set(`/repos/${repository}/pulls/129`, { number: 129, state: 'closed', merged: true,
    base: { ref: 'main', repo: { full_name: repository } }, head: { sha: bSha }, merge_commit_sha: mergeSha,
    merged_at: '2026-09-26T02:00:00.000Z' });
  values.set(`/repos/${repository}/git/commits/${mergeSha}`, { parents: [{ sha: baseSha }, { sha: bSha }], tree: { sha: treeSha } });
  values.set(`/repos/${repository}/git/commits/${bSha}`, { tree: { sha: treeSha } });
  values.set(`/repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`, jobs);
  values.set(`/repos/${repository}/actions/runs/${runId}/attempts/${attempt}`, run);
  values.set(`/repos/${repository}/check-runs/555`, { id: 555, name: 'architecture-gate / owner-addition',
    status: 'completed', conclusion: 'success', head_sha: sha('8'), app: { id: 15368 } });
  values.set(`/repos/${repository}/check-runs/555/annotations?per_page=100`, [{
    path: callerPath, start_line: 1, end_line: 1, annotation_level: 'notice',
    title: 'AGK_OWNER_ADDITION_ARTIFACT_V1', message: `id=987;sha256=${digest(zip)}`,
  }]);
  values.set(`/repos/${repository}/check-runs/556`, { id: 556, name: 'architecture-gate / accept',
    status: 'completed', conclusion: 'success', head_sha: sha('8'), app: { id: 15368 } });
  values.set(`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`, { total_count: 1, artifacts: [artifact] });
  values.set(`/repos/${repository}/actions/artifacts/987/zip`, zip);
  values.set(`/repos/${repository}/git/tags/${tagObjectOid}`, { sha: tagObjectOid,
    object: { type: 'commit', sha: bSha }, message: JSON.stringify(additionRecord) });
  values.set(`/repos/${repository}/git/ref/tags/architecture-owner-addition/${bSha}`, { ref: procedure.tagRef,
    object: { type: 'tag', sha: tagObjectOid } });
  values.set(`/repos/${repository}/git/ref/heads/main`, { ref: 'refs/heads/main', object: { sha: targetSha } });
  values.set(`/repos/${repository}/git/commits/${targetSha}`, { sha: targetSha });
  values.set(`/repos/${repository}/compare/${mergeSha}...${targetSha}?per_page=250`, { status: 'ahead',
    base_commit: { sha: mergeSha }, merge_base_commit: { sha: mergeSha }, commits: [{ sha: targetSha }] });
  for (const [path, value] of contents) values.set(path, value);

  if (scenario === 'wrong-repository') values.get(`/repos/${repository}/pulls/129`).base.repo.full_name = 'flair-agency/other';
  if (scenario === 'wrong-base') run.pull_requests[0].base.sha = sha('9');
  if (scenario === 'wrong-head') run.pull_requests[0].head.sha = sha('9');
  if (scenario === 'wrong-run') values.get(`/repos/${repository}/actions/runs/${runId}/attempts/${attempt}`).id = 9002;
  if (scenario === 'wrong-attempt') run.run_attempt = 1;
  if (scenario === 'wrong-producer') jobs.jobs[0].name = 'other / owner-addition';
  if (scenario === 'wrong-workflow') run.referenced_workflows[0].sha = sha('9');
  if (scenario === 'wrong-second-parent') values.get(`/repos/${repository}/git/commits/${mergeSha}`).parents[1].sha = sha('9');
  if (scenario === 'missing-evidence') values.set(`/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`, { total_count: 0, artifacts: [] });
  if (scenario === 'readback-ref') values.get(`/repos/${repository}/git/ref/heads/main`).ref = 'refs/heads/release';
  if (scenario === 'readback-missing-ref') delete values.get(`/repos/${repository}/git/ref/heads/main`).ref;
  if (scenario === 'readback-authority') values.set(`/repos/${repository}/contents/${authorityPath}?ref=${targetSha}`, {
    type: 'file', encoding: 'base64', content: Buffer.from('different observed authority\n').toString('base64'),
  });
  if (scenario === 'readback-ancestry') values.get(`/repos/${repository}/compare/${mergeSha}...${targetSha}?per_page=250`).status = 'diverged';

  const requests = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://api.github.com') throw new Error(`Unexpected API origin: ${parsed.origin}`);
    if (options?.method && options.method !== 'GET') throw new Error(`Unexpected API method: ${options.method}`);
    const route = parsed.pathname + parsed.search;
    requests.push({ url, route, options });
    const value = values.get(route);
    if (value === undefined) throw new Error(`Unexpected fixture request: ${route}`);
    if (Buffer.isBuffer(value)) return { ok: true, arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) };
    return { ok: true, status: 200, json: async () => structuredClone(value) };
  };
  return { args: { repository, pullRequestNumber: 129, githubToken: 'fixture-token', runId, attempt,
    fetchImpl, identities: { ordinaryPrompt: { path: ordinaryPromptPath } } }, requests,
    expected: { repository, baseSha, bSha, mergeSha, targetSha, treeSha, runId, attempt, callerPath,
      workflowPath, workflowSha, policyPath, authorityPath, ownerPromptPath, ownerSchemaPath,
      ordinaryPromptPath, ordinarySchemaPath, targetRef: `refs/heads/main`, authorityDigest: digest(authorityBytes) },
  };
}
