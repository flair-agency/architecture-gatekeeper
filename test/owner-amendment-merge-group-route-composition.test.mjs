import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildOwnerAmendmentBlockRecord } from '../src/owner-amendment-block-record.mjs';
import { buildOwnerAmendmentOwnerDecisionRecord } from '../src/owner-amendment-owner-decision-record.mjs';
import { validateOwnerAmendmentOwnerDecisionAmendmentRecord } from '../src/owner-amendment-owner-decision-amendment-record.mjs';
import { orchestrateOwnerAmendmentBlockHandoff } from '../src/owner-amendment-block-handoff-orchestrator.mjs';
import { handoffOwnerAmendmentOwnerDecision } from '../src/owner-amendment-owner-decision-handoff.mjs';
import { discoverOwnerAmendmentBlockArtifact } from '../src/owner-amendment-artifact-discovery.mjs';
import { fetchOwnerAmendmentBlockArtifact } from '../src/owner-amendment-artifact.mjs';
import { extractOwnerAmendmentArtifactZip } from '../src/owner-amendment-artifact-zip.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from '../src/owner-amendment-handoff-git-context.mjs';
import { selectOwnerAmendmentMergeGroupBContext } from '../src/owner-amendment-merge-group-b-context.mjs';
import { composeOwnerAmendmentMergeGroupEvidence } from '../src/owner-amendment-merge-group-evidence.mjs';
import { createOwnerAmendmentMergeGroupAcceptanceVerifier } from '../src/owner-amendment-merge-group-acceptance.mjs';
import { createOwnerAmendmentSemanticEligibilityProducer,
  validateOwnerAmendmentSemanticEligibilityReceipt } from '../src/owner-amendment-semantic-eligibility.mjs';
import { validateOwnerAmendmentBlockSemanticRecord } from '../src/owner-amendment-block-semantic-record.mjs';
import { verifyOwnerAmendmentBlockEvidence } from '../src/owner-amendment-attestation.mjs';
import { parseOwnerAmendmentSemanticTagObject } from '../src/owner-amendment-semantic-tag-object.mjs';
import { deriveOwnerAmendmentGitChanges } from '../src/owner-amendment-git-changes.mjs';
import { materializeAuthoritySet } from '../src/authority-set.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { inspectOwnerAmendmentSemanticProducerAttempts } from '../src/owner-amendment-semantic-producer-attempts.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = '.github/workflows/self-architecture-gate.yml';
const tagNamespace = 'refs/tags/architecture-gatekeeper/amendments';
const tagRulesetId = 77;
const producerJobName = 'owner-amendment-semantic-eligibility-signer';
const tagger = { name: 'Fixture', email: 'fixture@example.invalid', date: '2026-09-29T10:00:00.000Z' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const canonicalBytes = value => Buffer.from(`${JSON.stringify(canonical(value))}\n`);
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};

function makeZip(entries) {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const { name: rawName, bytes: rawBytes } of entries) {
    const name = Buffer.from(rawName), bytes = Buffer.from(rawBytes), crc = crc32(bytes);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, bytes);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name); offset += local.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(centralParts), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

function git(repo, args, input) {
  return execFileSync('git', ['-C', repo, ...args], { input, encoding: 'buffer', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_AUTHOR_DATE: '2026-09-29T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-29T00:00:00Z' } });
}

function put(repo, path, bytes) {
  const target = join(repo, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
}

function commit(repo, message) {
  git(repo, ['add', '-A']); git(repo, ['commit', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']).toString('ascii').trim();
}

// Deterministic stand-in for `gh attestation verify` output. This fixture does
// not exercise GitHub's signature verification or establish live provenance.
function attestation(recordBytes, expected) {
  const signer = `https://github.com/${repository}/.github/workflows/architecture-gate.yml@refs/heads/main`;
  const caller = `https://github.com/${repository}/${workflowPath}@refs/heads/main`;
  return [{ verificationResult: { signature: { certificate: {
    subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
    githubWorkflowRepository: repository, githubWorkflowSHA: expected.workflowSha,
    buildSignerDigest: expected.workflowSha, buildConfigDigest: expected.workflowSha,
    sourceRepositoryDigest: expected.workflowSha, sourceRepositoryURI: `https://github.com/${repository}`,
    sourceRepositoryRef: 'refs/heads/main', githubWorkflowTrigger: 'pull_request_target',
    runInvocationURI: `https://github.com/${repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
  } }, statement: { predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{ name: 'review-record.json', digest: { sha256: hash(recordBytes) } }] } } }];
}

function apiFixture({ repoPath, baseSha, bSha, groupSha, triggerHeadSha, profile, triggerRecordBytes, bundleBytes }) {
  const repositoryId = 1379218762;
  const triggerRunId = '101', triggerAttempt = '2', triggerPr = 199, bPr = 201;
  const eligibilityRunId = '202', eligibilityAttempt = '1';
  const bTreeSha = git(repoPath, ['rev-parse', `${bSha}^{tree}`]).toString('ascii').trim();
  const profileName = profile === 'completed-block-v1' ? 'block' : 'owner-decision';
  let triggerZip = makeZip([{ name: 'review-record.json', bytes: triggerRecordBytes },
    { name: 'attestation-bundle.json', bytes: bundleBytes }]);
  const artifacts = new Map();
  const tags = new Map();
  let eligibilityZip;
  const queueEnteredAt = '2026-09-29T12:00:00Z';
  const createdAt = '2026-09-29T09:00:00Z';
  const run = { id: Number(triggerRunId), run_attempt: Number(triggerAttempt), status: 'completed',
    event: 'pull_request_target', path: `${workflowPath}@refs/heads/main`, repository: { full_name: repository, id: repositoryId },
    head_repository: { full_name: repository, id: repositoryId }, head_sha: baseSha,
    pull_requests: [{ number: triggerPr, base: { ref: 'main', sha: baseSha, repo: { full_name: repository, id: repositoryId } },
      head: { sha: triggerHeadSha, repo: { full_name: repository, id: repositoryId } } }] };
  const triggerArtifactName = `owner-amendment-${profileName}-${baseSha}-${triggerHeadSha}-${triggerRunId}-${triggerAttempt}`;
  artifacts.set('444', { id: 444, name: triggerArtifactName, expired: false, size_in_bytes: triggerZip.length,
    digest: `sha256:${hash(triggerZip)}`, expires_at: '2099-09-30T10:00:00Z', workflow_run: { id: 101,
      repository_id: repositoryId, head_repository_id: repositoryId, head_sha: baseSha } });
  let selectedTag;
  const refUrl = `/repos/${repository.split('/').join('/')}/git/ref/tags/${tagNamespace.slice('refs/tags/'.length)}/`;
  function response(status, body, extras = {}) { return { ok: status >= 200 && status < 300, status,
    json: async () => body, ...extras }; }
  const fetchImpl = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    const path = url.pathname;
    if (path === `/repos/${repository}`) return response(200, { id: repositoryId, full_name: repository });
    if (path.endsWith(`/pulls/${bPr}`)) return response(200, { number: bPr, state: 'open', draft: false,
      created_at: createdAt, base: { ref: 'main', sha: baseSha, repo: { id: repositoryId, full_name: repository } },
      head: { sha: bSha, repo: { id: repositoryId, full_name: repository } } });
    if (path.endsWith(`/pulls/${triggerPr}`)) return response(200, { number: triggerPr, state: 'closed', draft: false,
      merged: false, merged_at: null, base: { ref: 'main', sha: baseSha, repo: { id: repositoryId, full_name: repository } },
      head: { sha: triggerHeadSha, repo: { id: repositoryId, full_name: repository } } });
    if (path.endsWith(`/actions/runs/${triggerRunId}/attempts/${triggerAttempt}`)) return response(200, run);
    if (path.endsWith(`/actions/runs/${triggerRunId}/artifacts`)) return response(200, { total_count: 1, artifacts: [artifacts.get('444')] });
    if (path.endsWith('/actions/artifacts/444')) return response(200, artifacts.get('444'));
    if (path.endsWith('/actions/artifacts/444/zip')) return response(200, null, { body: new ReadableStream({
      start(controller) { controller.enqueue(triggerZip); controller.close(); },
    }) });
    if (path.endsWith('/actions/runs/202/attempts/1')) return response(200, {
      id: 202, run_attempt: 1, status: 'completed', event: 'pull_request_target', path: `${workflowPath}@refs/heads/main`,
      repository: { full_name: repository, id: repositoryId }, head_repository: { full_name: repository, id: repositoryId },
      head_sha: baseSha, pull_requests: [{ number: bPr, base: { ref: 'main', sha: baseSha,
        repo: { full_name: repository } }, head: { sha: bSha, repo: { full_name: repository } } }],
    });
    if (path.endsWith('/actions/workflows/self-architecture-gate.yml/runs')) return response(200, {
      total_count: 1, workflow_runs: [{ id: 202, run_attempt: 1, created_at: '2026-09-29T10:30:00Z',
        started_at: '2026-09-29T10:30:00Z', status: 'completed', conclusion: 'success',
        event: 'pull_request_target', path: `${workflowPath}@refs/heads/main`,
        repository: { full_name: repository, id: repositoryId }, head_repository: { full_name: repository, id: repositoryId },
        head_sha: baseSha, pull_requests: [{ number: bPr,
          base: { ref: 'main', sha: baseSha, repo: { full_name: repository } },
          head: { sha: bSha, repo: { full_name: repository } } }] }],
    });
    if (path.endsWith('/actions/runs/202/attempts/1/jobs')) return response(200, { total_count: 1, jobs: [{
      id: 909, run_id: 202, run_attempt: 1, head_sha: baseSha,
      name: 'architecture-gate / owner-amendment-semantic-eligibility-signer', status: 'completed', conclusion: 'success',
      started_at: '2026-09-29T10:30:00Z',
      completed_at: '2026-09-29T11:00:00Z' }] });
    if (path.endsWith('/actions/runs/202/artifacts')) return response(200, { total_count: 1,
      artifacts: [artifacts.get('555')] });
    if (path.endsWith('/actions/artifacts/555')) return response(200, artifacts.get('555'));
    if (path.endsWith('/actions/artifacts/555/zip')) return response(200, null, { body: new ReadableStream({
      start(controller) { controller.enqueue(eligibilityZip); controller.close(); },
    }) });
    if (path.endsWith('/rulesets/77')) return response(200, { id: 77, target: 'tag', enforcement: 'active',
      conditions: { ref_name: { include: [`${tagNamespace}/*`], exclude: [] } },
      rules: [{ type: 'update' }, { type: 'deletion' }], bypass_actors: [] });
    if (path.includes('/git/ref/tags/')) {
      if (!selectedTag) return response(404, {});
      return response(200, { ref: selectedTag.tagRef, object: { type: 'tag', sha: selectedTag.objectOid } });
    }
    if (path.endsWith('/git/tags') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      const timestamp = Math.floor(Date.parse(body.tagger.date) / 1000);
      const rawTagObject = Buffer.from(`object ${body.object}\ntype ${body.type}\ntag ${body.tag}\n` +
        `tagger ${body.tagger.name} <${body.tagger.email}> ${timestamp} +0000\n\n${body.message}`, 'utf8');
      const objectOid = git(repoPath, ['mktag'], rawTagObject).toString('ascii').trim();
      selectedTag = { tagRef: `refs/tags/${body.tag}`, objectOid, rawTagObject,
        tagName: body.tag, message: body.message, object: body.object };
      return response(201, { sha: objectOid, tag: body.tag, message: body.message,
        object: { sha: body.object, type: 'commit' } });
    }
    if (path.endsWith('/git/refs') && options.method === 'POST') {
      const body = JSON.parse(options.body); assert.equal(body.sha, selectedTag.objectOid);
      return response(201, { ref: body.ref, object: { sha: body.sha, type: 'tag' } });
    }
    if (path.endsWith(`/git/tags/${selectedTag?.objectOid}`)) return response(200, {
      sha: selectedTag.objectOid, tag: selectedTag.tagName, message: selectedTag.message,
      object: { sha: selectedTag.object, type: 'commit' },
    });
    if (path.endsWith('/commits') || path.endsWith(`/commits/${groupSha}`)) {
      if (path.endsWith(`/commits/${groupSha}`)) return response(200, { sha: groupSha,
        parents: [{ sha: baseSha }, { sha: bSha }], commit: { tree: { sha: bTreeSha } } });
      return response(500, {});
    }
    if (path.endsWith(`/commits/${bSha}`)) return response(200, { sha: bSha, commit: { tree: { sha: bTreeSha } } });
    if (path.endsWith(`/commits/${bSha}/pulls`)) return response(200, [{ number: bPr, state: 'open', draft: false,
      created_at: createdAt, base: { ref: 'main', sha: baseSha, repo: { full_name: repository, id: repositoryId } },
      head: { sha: bSha, repo: { full_name: repository, id: repositoryId } } }]);
    if (path === '/graphql') return response(200, { data: { repository: { id: String(repositoryId), nameWithOwner: repository,
      pullRequest: { number: bPr, state: 'OPEN', isDraft: false, baseRefName: 'main', baseRefOid: baseSha,
        headRefOid: bSha, baseRepository: { id: String(repositoryId), nameWithOwner: repository },
        headRepository: { id: String(repositoryId), nameWithOwner: repository }, mergeQueueEntry: {
          state: 'AWAITING_CHECKS', enqueuedAt: queueEnteredAt, baseCommit: { oid: baseSha },
          headCommit: { oid: bSha }, pullRequest: { number: bPr },
        } } } } });
    return response(404, { message: `Unexpected API request ${options.method ?? 'GET'} ${path}` });
  };
  const readTagObject = async (_repository, tagRef, _tagName, objectOid) => {
    assert.equal(tagRef, selectedTag.tagRef); assert.equal(objectOid, selectedTag.objectOid);
    return Buffer.from(selectedTag.rawTagObject);
  };
  // This modeled CLI result is parsed by the production verifier, but no
  // cryptographic verification is performed in this local test.
  const runGh = (_command, args) => {
    const recordBytes = readFileSync(args[2]);
    const record = JSON.parse(recordBytes.toString('utf8'));
    return JSON.stringify(attestation(recordBytes, { workflowSha: record.workflowSha ?? record.producer?.workflowSha ?? record.baseSha,
      runId: record.runId ?? record.producer?.runId, runAttempt: record.runAttempt ?? record.producer?.runAttempt }));
  };
  return { fetchImpl, readTagObject, runGh, selectedTag: () => selectedTag,
    setTriggerRecord(recordBytes, attestationBytes) {
      triggerZip = makeZip([{ name: 'review-record.json', bytes: recordBytes },
        { name: 'attestation-bundle.json', bytes: attestationBytes }]);
      const artifact = artifacts.get('444'); artifact.size_in_bytes = triggerZip.length;
      artifact.digest = `sha256:${hash(triggerZip)}`;
    },
    setEligibilityZip(zip, artifact) { eligibilityZip = zip; artifacts.set('555', artifact); },
    queueEnteredAt, createdAt, runIds: { triggerRunId, triggerAttempt, eligibilityRunId, eligibilityAttempt },
    repositoryId, triggerPr, bPr, triggerArtifactName };
}

function makeRepo(profile) {
  const repoPath = mkdtempSync(join(tmpdir(), 'agk-merge-group-route-'));
  git(repoPath, ['init', '-q']);
  const authorityLimits = { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 65_536,
    maxTotalBytes: 262_144, maxPromptBytes: 524_288 };
  const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits,
    ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile: profile,
      authorityId: 'architecture-contract', authorityPath: 'docs/architecture.md',
      evidenceProducer: 'github-actions-attestation', tagNamespace, maxPromptBytes: 350_000 },
  } } };
  const members = [{ id: 'architecture-contract', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' }];
  if (profile === 'completed-owner-decision-self-v1') members.push({ id: 'ownership-charter', repository: 'self',
    revision: 'authority-revision', path: 'docs/ownership.md' });
  put(repoPath, '.codex/gatekeeper/ci-policy.json', Buffer.from(`${JSON.stringify(policy)}\n`));
  put(repoPath, '.codex/gatekeeper/authorities.json', Buffer.from(`${JSON.stringify({ version: 1, authorities: members })}\n`));
  const oldArchitecture = Buffer.from('# Architecture\nExisting rule needs an owner decision.\n');
  const newArchitecture = Buffer.from('# Architecture\nThe amended rule preserves protected review.\n');
  put(repoPath, 'docs/architecture.md', oldArchitecture);
  let oldOwnership, newOwnership;
  if (members.length === 2) {
    oldOwnership = Buffer.from('# Ownership\nThe owner retains this policy choice.\n');
    newOwnership = Buffer.from('# Ownership\nThe owner resolves this policy choice.\n');
    put(repoPath, 'docs/ownership.md', oldOwnership);
  }
  const baseSha = commit(repoPath, 'protected base');
  put(repoPath, 'docs/architecture.md', newArchitecture);
  if (oldOwnership) put(repoPath, 'docs/ownership.md', newOwnership);
  const bSha = commit(repoPath, 'authority-only B');
  const groupCommit = git(repoPath, ['commit-tree', `${bSha}^{tree}`, '-p', baseSha, '-p', bSha, '-m', 'merge group']);
  const groupSha = groupCommit.toString('ascii').trim();
  const runGit = args => git(repoPath, args);
  return { repoPath, profile, baseSha, bSha, groupSha, runGit, policy, members,
    oldArchitecture, newArchitecture, oldOwnership, newOwnership, triggerHeadSha: 'c'.repeat(40),
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }) };
}

function triggerEvidence(fixture, resolved, api) {
  const schema = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/ci-decision.schema.json'), 'utf8'));
  const validation = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/decision.validation.json'), 'utf8'));
  const inputDigests = Object.fromEntries(['manifest', 'policy', 'prompt', 'schema', 'validation'].map(key =>
    [key, hash(Buffer.from(`trigger-${key}`))]));
  inputDigests.manifest = hash(resolved.manifestBytes);
  inputDigests.policy = hash(resolved.policyBytes);
  const authority = { version: 1, selfRepository: repository, authorityRevision: fixture.baseSha,
    manifestSha256: hash(resolved.manifestBytes), setDigest: hash(Buffer.from(JSON.stringify(resolved.manifest.authorities.map((member, index) => {
      const bytes = index === 0 ? fixture.oldArchitecture : fixture.oldOwnership;
      return { id: member.id, repository, resolvedCommit: fixture.baseSha, path: member.path,
        byteLength: bytes.length, sha256: hash(bytes) };
    })))),
    members: resolved.manifest.authorities.map((member, index) => {
      const bytes = index === 0 ? fixture.oldArchitecture : fixture.oldOwnership;
      return { id: member.id, repository, resolvedCommit: fixture.baseSha, path: member.path,
        byteLength: bytes.length, sha256: hash(bytes) };
    }) };
  const producerContext = { repository, prNumber: 199, baseSha: fixture.baseSha, headSha: fixture.triggerHeadSha,
    mergeSha: 'd'.repeat(40), workflowSha: fixture.baseSha, workflowPath, runId: '101', runAttempt: '2' };
  let decision;
  if (fixture.profile === 'completed-block-v1') {
    decision = { decision: 'BLOCK', findings: [], summary: 'The previous rule needs review.', authority: ['protected architecture'],
      authorityFiles: ['docs/architecture.md'], authorityIds: ['architecture-contract'], responsibility: ['review'],
      capabilitySurface: ['CI'], qualityGuarantees: ['fail closed'], reviewedScope: ['change A'], prohibitedChanges: ['weaken gate'],
      gates: { sharedMechanism: { decision: 'BLOCK', summary: 'Review rule.', consumerOwnership: '', failClosedBehavior: '', compatibility: '', minimality: '' },
        trustBoundary: { decision: 'PASS', summary: 'Credentials remain isolated.', tokenPermissions: '', untrustedInputs: '', credentialHandling: '', reportingIsolation: '' } } };
  } else {
    decision = { decision: 'OWNER_DECISION', findings: [], summary: 'The existing rule needs an owner choice.',
      authority: authority.members.map(member => member.id), authorityFiles: authority.members.map(member => member.path),
      authorityIds: authority.members.map(member => member.id), responsibility: ['owner decision'],
      capabilitySurface: ['review'], qualityGuarantees: ['preserve protected policy'], reviewedScope: ['historical rule'],
      prohibitedChanges: ['self acceptance'],
      gates: { sharedMechanism: { decision: 'OWNER_DECISION', summary: 'Existing rule needs an owner choice.', consumerOwnership: '', failClosedBehavior: '', compatibility: '', minimality: '' },
        trustBoundary: { decision: 'PASS', summary: 'No trust change.', tokenPermissions: '', untrustedInputs: '', credentialHandling: '', reportingIsolation: '' } } };
  }
  const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
  const record = fixture.profile === 'completed-block-v1'
    ? buildOwnerAmendmentBlockRecord({ decisionBytes, schema, validation, authority, context: producerContext, inputDigests })
    : buildOwnerAmendmentOwnerDecisionRecord({ decisionBytes, schema, validation, authority, context: producerContext, inputDigests });
  const recordBytes = Buffer.from(`${JSON.stringify(record)}\n`);
  const bundleBytes = Buffer.from('{"controlled-attestation-fixture":true}\n');
  const blockRun = { runId: '101', runAttempt: '2', headSha: fixture.triggerHeadSha, aPrNumber: 199,
    workflowPath, workflowRef: 'refs/heads/main', workflowSha: fixture.baseSha };
  const purpose = 'Resolve the previous protected authority decision.';
  const handoffArgs = { repository, policy: resolved.policy, manifest: resolved.manifest,
    baseSha: fixture.baseSha, bSha: fixture.bSha, changedFiles: resolved.changedFiles,
    baseAuthorityBytes: resolved.authorityBytes.base, headAuthorityBytes: resolved.authorityBytes.head,
    purpose, token: 'fixture-token', runGh: api.runGh, rulesetId: tagRulesetId, tagger,
    tagNamespace, fetchImpl: api.fetchImpl };
  return { authority, producerContext, decision, decisionBytes, record, recordBytes, bundleBytes, blockRun, purpose, handoffArgs };
}

function eligibilityDecision(prepared) {
  // This simulated reviewer response exercises the production closed
  // decision/receipt validation; its all-true checks are not semantic proof.
  const checks = Object.fromEntries(['materiallyAddressesTrigger', 'amendsOnlyTargetDecision', 'excludesUnrelatedChanges',
    'excludesImplementationWorkflowAndExecutablePolicyEdits', 'excludesUnsupportedCompletionClaims',
    'resultingAuthorityIsCoherent', 'assessesResultingRulesWithoutRequiringAgreementWithSupersededRules'].map(key => [key, true]));
  return canonicalBytes({ version: 1, kind: 'owner-amendment-semantic-eligibility-decision', eligibility: 'ELIGIBLE',
    triggerProfile: prepared.triggerProfile, authorityIds: [...prepared.authorityIds], authoritySetDigest: prepared.authoritySetDigest, checks });
}

function makeSemanticPipeline(fixture, resolved, trigger, evidence, api, gitChanges) {
  const profile = fixture.profile;
  const manifest = resolved.manifest;
  const policyBytes = Buffer.from(resolved.policyBytes), manifestBytes = Buffer.from(resolved.manifestBytes);
  const members = manifest.authorities.map(member => {
    const bytes = fixture.runGit(['--no-replace-objects', 'show', `${fixture.baseSha}:${member.path}`]);
    return { id: member.id, repository, resolvedCommit: fixture.baseSha, path: member.path,
      byteLength: bytes.length, sha256: hash(bytes), bytes };
  });
  const authoritySet = { digest: hash(Buffer.from(JSON.stringify(members.map(({ bytes, ...member }) => member)))), members };
  const changes = gitChanges.changes.map(change => ({ path: change.path,
    beforeBytes: Buffer.from(change.beforeBytes), afterBytes: Buffer.from(change.afterBytes) }));
  const producerIdentity = { workflowPath, workflowSha: fixture.baseSha, workflowRef: 'refs/heads/main',
    runId: '202', runAttempt: '1', jobId: 'owner-amendment-semantic-eligibility-signer' };
  const gatekeeper = { repository, revision: fixture.baseSha, package: null };
  const tagObjectBytes = Buffer.from(api.selectedTag().rawTagObject);
  const tag = { tagRef: api.selectedTag().tagRef, tagObjectOid: api.selectedTag().objectOid,
    observedTagRefOid: api.selectedTag().objectOid };
  const validators = {
    resolveProtectedInputs: () => ({ baseBranch: 'main', policyBytes, manifestBytes, authoritySet, changes,
      diffBytes: gitChanges.diffBytes }),
    resolveExactGitDiff: () => ({ diffBytes: fixture.runGit(['--no-replace-objects', 'diff', '--binary', '--no-ext-diff', '--no-renames', fixture.baseSha, fixture.bSha]) }),
    resolveExactBFiles: ({ paths }) => ({ files: paths.map(path => ({ path,
      bytes: fixture.runGit(['--no-replace-objects', 'show', `${fixture.bSha}:${path}`]) })) }),
    resolveProtectedSelection: () => ({ selectedProducer: producerIdentity, selectedGatekeeper: gatekeeper }),
    validateTriggerProvenance: ({ expected }) => {
      const checked = verifyOwnerAmendmentBlockEvidence({ recordBytes: trigger.recordBytes,
        bundleBytes: trigger.bundleBytes, expected: { repository, workflowPath: expected.workflowPath,
          workflowSha: expected.workflowSha, workflowRef: expected.workflowRef,
          runId: expected.runId, runAttempt: expected.runAttempt }, runGh: api.runGh });
      return { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository, baseSha: fixture.baseSha,
        triggerProfile: profile, triggerReviewRecordSha256: checked.recordSha256,
        workflowPath: expected.workflowPath, workflowSha: expected.workflowSha, workflowRef: expected.workflowRef,
        runId: expected.runId, runAttempt: expected.runAttempt };
    },
    validateAmendmentRecord: input => profile === 'completed-block-v1'
      ? validateOwnerAmendmentBlockSemanticRecord({ bytes: input.bytes,
        expected: { ...input.expected, changes: input.expected.changes }, repository, baseSha: fixture.baseSha,
        bSha: fixture.bSha, triggerProfile: profile,
        authority: { authorityId: resolved.scope.authorityId, authorityPath: resolved.scope.authorityPath,
          previousSha256: hash(resolved.authorityBytes.base), newSha256: hash(resolved.authorityBytes.head) },
        attestationBundleSha256: hash(trigger.bundleBytes), resultingAuthoritySetDigest: input.expected.resultingAuthoritySetDigest })
      : validateOwnerAmendmentOwnerDecisionAmendmentRecord(input),
    validateTag: ({ expected }) => {
      const parsed = parseOwnerAmendmentSemanticTagObject(tagObjectBytes, { bSha: fixture.bSha,
        triggerProfile: profile, tagRef: expected.tagRef });
      const amendment = validators.validateAmendmentRecord({ bytes: parsed.amendmentRecordBytes,
        expected: { repository, baseSha: fixture.baseSha, bSha: fixture.bSha, policyRevision: fixture.baseSha,
          triggerProfile: profile, triggerReviewRecordSha256: expected.triggerReviewRecordSha256,
          authoritySetDigest: authoritySet.digest, resultingAuthoritySetDigest: evidence.resultingAuthoritySetDigest,
          changes: changes.map(change => ({ path: change.path, beforeSha256: hash(change.beforeBytes), afterSha256: hash(change.afterBytes) })) } });
      assert.equal(amendment.status, 'VERIFIED_OWNER_AMENDMENT_RECORD');
      return { status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha: fixture.baseSha,
        bSha: fixture.bSha, triggerProfile: profile, triggerReviewRecordSha256: expected.triggerReviewRecordSha256,
        amendmentRecordSha256: hash(parsed.amendmentRecordBytes), tagRef: expected.tagRef,
        tagObjectOid: expected.tagObjectOid, observedTagRefOid: expected.observedTagRefOid };
    },
  };
  const semantic = createOwnerAmendmentSemanticEligibilityProducer(validators);
  const prepared = semantic.prepare({ repository, baseSha: fixture.baseSha, bSha: fixture.bSha,
    triggerProfile: profile, policyRevision: fixture.baseSha, policyBytes, manifestBytes, authoritySet,
    changes, diffBytes: gitChanges.diffBytes, triggerReviewRecordBytes: trigger.recordBytes,
    triggerProducer: { workflowPath, workflowSha: fixture.baseSha, workflowRef: 'refs/heads/main',
      runId: '101', runAttempt: '2', jobId: profile === 'completed-block-v1' ? 'block' : 'owner decision' },
    amendmentRecordBytes: parseOwnerAmendmentSemanticTagObject(tagObjectBytes, { bSha: fixture.bSha,
      triggerProfile: profile, tagRef: tag.tagRef }).amendmentRecordBytes,
    tag, tagObjectBytes, producer: producerIdentity, selectedProducer: producerIdentity,
    gatekeeper, selectedGatekeeper: gatekeeper, reviewModel: resolved.policy.model,
    reviewReasoningEffort: resolved.policy.reasoningEffort });
  const completed = semantic.complete({ prepared, decisionBytes: eligibilityDecision(prepared),
    producer: producerIdentity, gatekeeper, reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort });
  return { semantic, prepared, completed, producerIdentity, gatekeeper, tag, authoritySet, changes };
}

for (const profile of ['completed-block-v1', 'completed-owner-decision-self-v1']) {
  test(`exercises production route components with test adapter projections for ${profile}`, async t => {
    const fixture = makeRepo(profile);
    t.after(fixture.cleanup);
    const resolved = resolveOwnerAmendmentHandoffGitContext({ repository, baseSha: fixture.baseSha,
      headSha: fixture.bSha, runGit: fixture.runGit });
    const api = apiFixture({ repoPath: fixture.repoPath, baseSha: fixture.baseSha, bSha: fixture.bSha,
      groupSha: fixture.groupSha, triggerHeadSha: fixture.triggerHeadSha, profile,
      triggerRecordBytes: Buffer.from('{}'), bundleBytes: Buffer.from('{}') });
    const trigger = triggerEvidence(fixture, resolved, api);
    api.setTriggerRecord(trigger.recordBytes, trigger.bundleBytes);
    const authorityChanges = resolved.authorityChanges ?? [{ path: 'docs/architecture.md',
      beforeBytes: fixture.oldArchitecture, afterBytes: fixture.newArchitecture }];
    let handoff;
    if (profile === 'completed-block-v1') {
      handoff = await orchestrateOwnerAmendmentBlockHandoff({ ...trigger.handoffArgs,
        blockRun: trigger.blockRun, purpose: trigger.purpose });
      assert.equal(handoff.status, 'TAG_TRANSPORTED_AND_READ_BACK', handoff.reason);
    } else {
      const discovered = await discoverOwnerAmendmentBlockArtifact({ expected: { repository,
        runId: trigger.blockRun.runId, runAttempt: trigger.blockRun.runAttempt,
        baseSha: fixture.baseSha, headSha: fixture.triggerHeadSha, profile: 'ownerDecision' },
        token: 'fixture-token', fetchImpl: api.fetchImpl });
      assert.equal(discovered.status, 'DISCOVERED_OWNER_AMENDMENT_OWNER_DECISION_ARTIFACT', discovered.reason);
      handoff = await handoffOwnerAmendmentOwnerDecision({ ...trigger.handoffArgs,
        authorityChanges, priorAuthoritySetDigest: resolved.priorAuthoritySetDigest,
        resultingAuthoritySetDigest: resolved.resultingAuthoritySetDigest,
        triggerRun: { ...trigger.blockRun, artifactId: discovered.artifactId, prNumber: 199,
          event: 'pull_request_target' } });
      assert.equal(handoff.status, 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK', handoff.reason);
    }

    const event = { action: 'checks_requested', repository: { full_name: repository }, merge_group: {
      base_ref: 'refs/heads/main', base_sha: fixture.baseSha, head_sha: fixture.groupSha } };
    const selected = await selectOwnerAmendmentMergeGroupBContext({ event, token: 'fixture-token', fetchImpl: api.fetchImpl });
    assert.equal(selected.status, 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT', selected.reason);
    const evidence = await composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha: fixture.baseSha,
      bSha: fixture.bSha, runGit: fixture.runGit, tagNamespace,
      tagRef: `${tagNamespace}/${fixture.bSha}`, rulesetId: tagRulesetId, token: 'fixture-token',
      fetchImpl: api.fetchImpl, readTagObject: api.readTagObject, runGh: api.runGh });
    assert.equal(evidence.status, 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE', evidence.reason);
    assert.equal(evidence.triggerDecision, profile === 'completed-block-v1' ? 'BLOCK' : 'OWNER_DECISION');
    const gitChanges = deriveOwnerAmendmentGitChanges({ profile, repository, baseSha: fixture.baseSha,
      bSha: fixture.bSha, targetPath: resolved.scope.authorityPath,
      selectedAuthorityBytes: resolved.authorityBytes, changedFiles: resolved.changedFiles,
      authorityChanges: resolved.authorityChanges, runGit: fixture.runGit,
      readBlob: (revision, path) => fixture.runGit(['--no-replace-objects', 'show', `${revision}:${path}`]) });
    const semanticPipeline = makeSemanticPipeline(fixture, resolved, trigger, evidence, api, gitChanges);
    assert.equal(semanticPipeline.completed.status, 'COMPLETED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY');
    const receiptBytes = semanticPipeline.completed.receiptBytes;
    const eligibilityBundleBytes = Buffer.from('{"fixture":"model-free deterministic reviewer output"}\n');
    const eligibilityZip = makeZip([{ name: 'eligibility-receipt.json', bytes: receiptBytes },
      { name: 'attestation-bundle.json', bytes: eligibilityBundleBytes }]);
    const eligibilityArtifact = { id: 555, name: `owner-amendment-eligibility-${fixture.baseSha}-${fixture.bSha}-202-1`,
      expired: false, size_in_bytes: eligibilityZip.length, digest: `sha256:${hash(eligibilityZip)}`,
      expires_at: '2099-09-30T10:00:00Z', workflow_run: { id: 202, repository_id: api.repositoryId,
        head_repository_id: api.repositoryId, head_sha: fixture.baseSha } };
    api.setEligibilityZip(eligibilityZip, eligibilityArtifact);
    const attempts = await inspectOwnerAmendmentSemanticProducerAttempts({ repository,
      bBaseSha: fixture.baseSha, bHeadSha: fixture.bSha, bPullRequestCreatedAt: selected.bPullRequestCreatedAt,
      queueEnteredAt: selected.queueEnteredAt,
      listRuns: async () => (await api.fetchImpl(`https://api.github.com/repos/${repository}/actions/workflows/self-architecture-gate.yml/runs`)).json(),
      listJobs: async ({ runId, runAttempt }) => (await api.fetchImpl(
        `https://api.github.com/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs`)).json() });
    assert.equal(attempts.latestSignerAttempt.run.id, 202);
    const eligibilityExpected = { repository, runId: '202', runAttempt: '1', baseSha: fixture.baseSha,
      headSha: fixture.bSha, profile: 'eligibility' };
    const eligibilityDiscovered = await discoverOwnerAmendmentBlockArtifact({ expected: eligibilityExpected,
      token: 'fixture-token', fetchImpl: api.fetchImpl });
    assert.equal(eligibilityDiscovered.status, 'DISCOVERED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT', eligibilityDiscovered.reason);
    const eligibilityFetched = await fetchOwnerAmendmentBlockArtifact({ expected: { ...eligibilityExpected,
      artifactId: eligibilityDiscovered.artifactId }, token: 'fixture-token', fetchImpl: api.fetchImpl });
    assert.equal(eligibilityFetched.status, 'FETCHED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT', eligibilityFetched.reason);
    const eligibilityExtracted = extractOwnerAmendmentArtifactZip(eligibilityFetched.zipBytes, { profile: 'eligibility' });
    assert.equal(eligibilityExtracted.status, 'EXTRACTED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT', eligibilityExtracted.reason);
    const eligibilityProvenance = verifyOwnerAmendmentBlockEvidence({ recordBytes: eligibilityExtracted.eligibilityReceiptBytes,
      bundleBytes: eligibilityExtracted.attestationBundleBytes, expected: { repository,
        workflowPath, workflowSha: fixture.baseSha, workflowRef: 'refs/heads/main', runId: '202', runAttempt: '1' },
      runGh: api.runGh });
    assert.equal(eligibilityProvenance.status, 'VERIFIED_PRODUCER_ATTESTATION', eligibilityProvenance.reason);
    assert.equal(validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes,
      expected: semanticPipeline.completed.receipt }).status, 'VERIFIED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_RECEIPT');

    const policyParsed = parseCiPolicyJson(resolved.policyBytes.toString('utf8'));
    const priorPolicy = resolveCiPolicy(policyParsed, 'main');
    const materialized = await materializeAuthoritySet({ manifestBytes: resolved.manifestBytes,
      limits: resolved.limits, selfRepository: repository, selfRoot: fixture.repoPath,
      authorityRevision: fixture.baseSha, fetchExternal: async () => { throw new Error('no external authority expected'); },
      profile: priorPolicy.authorityProfile ?? 'v1' });
    // These test-authored projections mirror the production script's mapping
    // from component results, but the script itself is not invoked. Acceptance
    // below covers the verifier with modeled adapters, not production main()
    // wiring or a live protected route.
    const triggerAdapter = { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository, baseSha: fixture.baseSha,
      triggerProfile: profile, decision: evidence.triggerDecision, reviewRecordSha256: evidence.reviewRecordSha256,
      producerWorkflowPath: workflowPath, producerWorkflowSha: fixture.baseSha, producerWorkflowRef: 'refs/heads/main',
      producerRunId: evidence.producerRunId, producerRunAttempt: evidence.producerRunAttempt, provenanceVerified: true };
    const resultingSetDigest = semanticPipeline.prepared.resultingAuthoritySetDigest;
    if (profile === 'completed-owner-decision-self-v1') assert.equal(resultingSetDigest, evidence.resultingAuthoritySetDigest);
    const tagAdapter = { status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha: fixture.baseSha, bSha: fixture.bSha,
      triggerProfile: profile, triggerReviewRecordSha256: evidence.reviewRecordSha256,
      amendmentRecordSha256: evidence.amendmentRecordSha256, authorityId: resolved.scope.authorityId,
      authorityPath: resolved.scope.authorityPath, previousAuthoritySha256: hash(resolved.authorityBytes.base),
      amendedAuthoritySha256: hash(resolved.authorityBytes.head), priorAuthoritySetDigest: evidence.priorAuthoritySetDigest,
      resultingAuthoritySetDigest: resultingSetDigest,
      changes: gitChanges.changes.map(change => ({ path: change.path, beforeSha256: hash(change.beforeBytes), afterSha256: hash(change.afterBytes) })),
      purpose: evidence.purpose, targetValidated: true, tagRef: `${tagNamespace}/${fixture.bSha}`,
      tagObjectOid: evidence.tagObjectOid, observedTagRefOid: evidence.observedTagRefOid,
      protectedAgainstUpdateAndDeletion: true };
    const prepared = semanticPipeline.prepared;
    const reviewInputs = { status: 'RESOLVED_PROTECTED_OWNER_AMENDMENT_REVIEW_INPUTS', repository,
      baseSha: fixture.baseSha, bSha: fixture.bSha, triggerProfile: profile,
      triggerReviewRecordSha256: evidence.reviewRecordSha256, amendmentRecordSha256: evidence.amendmentRecordSha256,
      policySha256: hash(resolved.policyBytes), authoritySetDigest: materialized.setDigest,
      priorAuthoritySetDigest: materialized.setDigest, resultingAuthoritySetDigest: resultingSetDigest,
      authorityIds: materialized.members.map(member => member.id),
      changes: prepared.changes, diffSha256: prepared.diffSha256, promptSha256: prepared.promptSha256,
      schemaSha256: prepared.schemaSha256, model: prepared.model, reasoningEffort: prepared.reasoningEffort,
      diffBytes: gitChanges.diffBytes, promptBytes: prepared.promptBytes, schemaBytes: prepared.schemaBytes };
    const eligibilityAdapter = { status: 'VERIFIED_OWNER_AMENDMENT_ELIGIBILITY_EVIDENCE',
      receiptBytes: eligibilityExtracted.eligibilityReceiptBytes, receiptSha256: hash(receiptBytes),
      artifactId: eligibilityDiscovered.artifactId, artifactSha256: eligibilityFetched.artifactDigest.slice('sha256:'.length),
      provenanceVerified: true, checkConclusion: 'success', completedAt: '2026-09-29T11:00:00Z',
      producerWorkflowPath: workflowPath, producerWorkflowSha: fixture.baseSha, producerWorkflowRef: 'refs/heads/main',
      producerRunId: '202', producerRunAttempt: '1', producerJobId: producerJobName,
      gatekeeperRepository: repository, gatekeeperRevision: fixture.baseSha,
      principalAuthentication: 'not_verified', exactClaimAuthorization: 'not_verified' };
    const verifier = createOwnerAmendmentMergeGroupAcceptanceVerifier({ runtime: { repository, revision: fixture.baseSha },
      selectBContext: async () => selected,
      resolveProtectedPolicy: async () => ({ status: 'RESOLVED_PREVIOUS_OWNER_AMENDMENT_POLICY', repository,
        baseSha: fixture.baseSha, grade: 'G0', scope: 'authority-only', triggerProfile: profile,
        authorityId: resolved.scope.authorityId, authorityPath: resolved.scope.authorityPath,
        authoritySha256: hash(resolved.authorityBytes.base), tagNamespace, policySha256: hash(resolved.policyBytes),
        authoritySetDigest: materialized.setDigest, authorityIds: materialized.members.map(member => member.id),
        model: priorPolicy.model, reasoningEffort: priorPolicy.reasoningEffort,
        maxPromptBytes: priorPolicy.ownerAmendmentMaxPromptBytes }),
      verifyTrigger: async () => triggerAdapter, verifyTag: async () => tagAdapter,
      resolveEligibilityReviewInputs: async () => reviewInputs, verifyEligibility: async () => eligibilityAdapter });
    const accepted = await verifier.verify(event);
    assert.equal(accepted.status, 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION', accepted.reason);
    assert.equal(accepted.triggerDecision, profile === 'completed-block-v1' ? 'BLOCK' : 'OWNER_DECISION');
    assert.deepEqual(accepted.changes.map(change => change.path), authorityChanges.map(change => change.path));
    await t.test('rejects a different merge-group base or head', async () => {
      for (const field of ['base_sha', 'head_sha']) {
        const wrong = structuredClone(event);
        wrong.merge_group[field] = 'e'.repeat(40);
        const rejected = await selectOwnerAmendmentMergeGroupBContext({ event: wrong,
          token: 'fixture-token', fetchImpl: api.fetchImpl });
        assert.equal(rejected.status, 'INCOMPLETE');
      }
    });
    await t.test('rejects a wrong trigger run or attempt at artifact discovery', async () => {
      for (const [runId, runAttempt] of [['999', '2'], ['101', '3']]) {
        const rejected = await discoverOwnerAmendmentBlockArtifact({ expected: { repository, runId, runAttempt,
          baseSha: fixture.baseSha, headSha: fixture.triggerHeadSha,
          ...(profile === 'completed-block-v1' ? {} : { profile: 'ownerDecision' }) },
          token: 'fixture-token', fetchImpl: api.fetchImpl });
        assert.equal(rejected.status, 'INCOMPLETE');
      }
    });
    assert.deepEqual(gitChanges.changes.map(change => change.path), authorityChanges.map(change => change.path));
    if (profile === 'completed-owner-decision-self-v1') {
      assert.deepEqual(evidence.changes.map(change => change.path), gitChanges.changes.map(change => change.path));
    } else {
      // The production route projects legacy BLOCK's singleton change from its
      // independently derived Git diff because its historical evidence shape
      // has no full `changes` member.
      assert.equal(evidence.changes, undefined);
    }
    assert.equal(evidence.tagObjectOid, handoff.tagObjectSha);
    if (profile === 'completed-owner-decision-self-v1') {
      assert.deepEqual(evidence.changes.map(change => change.path), ['docs/architecture.md', 'docs/ownership.md']);
      assert.equal(evidence.priorAuthoritySetDigest, resolved.priorAuthoritySetDigest);
      assert.equal(evidence.resultingAuthoritySetDigest, resolved.resultingAuthoritySetDigest);
    }
  });
}
