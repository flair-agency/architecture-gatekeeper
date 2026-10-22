import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { publishProtectedSelfPrResult } = await import('../dist/self-pr-app-producer.mjs');
const { materializeAuthoritySet } = await import('../dist/authority-set.mjs');

const repository = 'flair-agency/architecture-gatekeeper', repositoryId = 1379218762;
const appId = 1234, installationId = 5678, now = Date.parse('2026-10-22T00:00:00Z');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const app = { appId, installationId, repositoryId, privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const canonicalAuthorities = [
  ['architecture-contract', 'docs/architecture.md'],
  ['architecture-authority-set', 'docs/architecture/authority-set.md'],
  ['architecture-owner-addition', 'docs/architecture/owner-addition.md'],
  ['architecture-owner-amendment', 'docs/architecture/owner-amendment.md'],
  ['architecture-review-execution', 'docs/architecture/review-execution.md'],
  ['architecture-self-profile', 'docs/architecture/self-profile.md'],
];
const policyPath = '.codex/gatekeeper/ci-policy.json', manifestPath = '.codex/gatekeeper/authorities.json';
const limits = { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 81_920, maxTotalBytes: 262_144, maxPromptBytes: 524_288 };
const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6.1-sol',
  reasoningEffort: 'medium', authorityManifestPath: manifestPath, authorityLimits: limits,
  ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile: 'completed-owner-decision-self-v1',
    authorityId: 'architecture-contract', authorityPath: 'docs/architecture.md', evidenceProducer: 'github-actions-attestation',
    tagNamespace: 'refs/tags/architecture-gatekeeper/amendments', maxPromptBytes: limits.maxPromptBytes },
  execution: { reviewJobTimeoutMinutes: 7, reviewStepTimeoutMinutes: 5, codexProfile: 'standard' } } } };
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); };
const hash = value => createHash('sha256').update(value).digest('hex');
async function makeGitState(extraMember = false) {
  const root = mkdtempSync(join(tmpdir(), 'self-pr-app-producer-'));
  git(root, 'init', '-q', '-b', 'main'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid');
  const authorities = [...canonicalAuthorities, ...(extraMember ? [['owner-extension', 'docs/owner-extension.md']] : [])];
  const manifest = { version: 1, authorities: authorities.map(([id, path]) => ({ id, repository: 'self', revision: 'authority-revision', path })) };
  const policyBytes = Buffer.from(JSON.stringify(policy));
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  write(root, policyPath, policyBytes); write(root, manifestPath, manifestBytes);
  for (const [, path] of authorities) write(root, path, `# Protected old authority: ${path}\n`);
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'old protected policy and Authority Set');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  const materialized = await materializeAuthoritySet({ manifestBytes, limits, selfRepository: repository, selfRoot: root, authorityRevision: baseSha });
  const provenance = { version: 1, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: materialized.manifestSha256, setDigest: materialized.setDigest,
    members: materialized.members.map(({ content, ...member }) => member) };
  git(root, 'switch', '-qc', 'candidate'); write(root, 'code.txt', 'ordinary implementation update\n');
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'candidate code update');
  const headSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '-q', 'main'); git(root, 'merge', '--no-ff', '-qm', 'reviewed test merge', headSha);
  const subjectSha = git(root, 'rev-parse', 'HEAD');
  return { root, baseSha, headSha, subjectSha, policyBytes, policySha256: hash(policyBytes), manifestBytes, limits, provenance,
    authorityIds: authorities.map(([id]) => id) };
}
const states = [await makeGitState(), await makeGitState(true)];
after(() => { for (const state of states) rmSync(state.root, { recursive: true, force: true }); });
const appBody = `## Outcome\nReviewed.\n\n## Issue coverage\n#123 covered.\n\n## Verification\nProtected tests passed.\n\n## Remaining work\nNone: no remaining work.\n\n## Authority and assurance\nReviewed against selected authority.`;
function response(url, payload, status = 200) {
  const value = new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(value, 'url', { value: url });
  return value;
}
function contextFixture(state, { staleSecond = false, finalRepoMismatch = false } = {}) {
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    const path = new URL(url).pathname.replace('/repos/' + repository, '');
    const stale = staleSecond && calls > 5;
    if (path === '/git/ref/heads/main') return response(url, { ref: 'refs/heads/main', object: { type: 'commit', sha: stale ? 'd'.repeat(40) : state.baseSha } });
    if (path === '/pulls/42') {
      const badRepo = finalRepoMismatch && calls > 3;
      return response(url, { number: 42, state: 'open', draft: false, merge_commit_sha: state.subjectSha,
        base: { ref: 'main', sha: state.baseSha, repo: { full_name: badRepo ? 'elsewhere/repo' : repository, id: repositoryId } },
        head: { sha: state.headSha, repo: { full_name: repository, id: repositoryId } } });
    }
    if (path === '/commits/refs/pull/42/merge') return response(url, { sha: state.subjectSha, parents: [{ sha: state.baseSha }, { sha: state.headSha }] });
    throw new Error(`Unexpected context request ${path}`);
  };
  return { fetchImpl, get calls() { return calls; } };
}
function completenessFixture(state, { valid = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(url, { number: 42, state: 'open', draft: false, body: valid ? appBody : 'incomplete',
      base: { ref: 'main', sha: state.baseSha, repo: { full_name: repository, id: repositoryId } },
      head: { sha: state.headSha, repo: { full_name: repository, id: repositoryId } } });
  };
  return { calls, fetchImpl };
}
function reporterFixture(state) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { ok: true, json: async () => ({ token: 'synthetic-token',
      expires_at: new Date(now + 60_000).toISOString(), permissions: { checks: 'write', metadata: 'read' },
      repositories: [{ id: repositoryId, full_name: repository }] }) };
    return { ok: true, json: async () => ({ id: 909, name: 'architecture-gate / accept', head_sha: state.subjectSha,
      status: 'completed', conclusion: 'success', app: { id: appId } }) };
  };
  return { calls, fetchImpl };
}
const schemaFor = state => ({ type: 'object', required: ['decision', 'authorityIds'], additionalProperties: false, properties: {
  decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
  authorityIds: { type: 'array', minItems: state.authorityIds.length, items: { type: 'string' } }, summary: { type: 'string' },
} });
const decisionFor = state => ({ decision: 'PASS', authorityIds: state.authorityIds, summary: 'Validated protected review.' });
function preparedReview(state, chosenDecision = decisionFor(state), provenance = state.provenance) { return {
  executionInput: { expectedExecution: { provider: 'codex', requestedModel: 'gpt-6.1-sol', requestedSettings: {} },
    hostStepOutcome: 'success', rawResponse: JSON.stringify(chosenDecision), maxResponseBytes: 65_536 },
  schemaBytes: JSON.stringify(schemaFor(state)), authorityProvenance: provenance, validationRules: null, maxSchemaBytes: 1_048_576,
}; }
function review(state, overrides = {}) { return { mode: 'enforced', policyResult: 'success', reviewResult: 'success',
  reviewBinding: { repository, prNumber: '42', baseSha: state.baseSha, headSha: state.headSha, reviewedSha: state.subjectSha },
  authoritySelection: { root: state.root, policyPath, policySha256: state.policySha256 },
  preparedReview: preparedReview(state), selectedAuthorityChanged: 'false', ...overrides }; }
function input({ state = states[0], context = contextFixture(state), complete = completenessFixture(state), reporter = reporterFixture(state),
  reviewValue = review(state), contextInput = {}, reviewInput = {}, getApp = () => app } = {}) {
  let appCalls = 0;
  return { context, complete, reporter, get appCalls() { return appCalls; },
    value: { context: { eventName: 'pull_request_target', event: { action: 'synchronize', repository: { full_name: repository, id: repositoryId },
      pull_request: { number: 42, state: 'open', draft: false,
        base: { ref: 'main', sha: state.baseSha, repo: { full_name: repository, id: repositoryId } },
        head: { sha: state.headSha, repo: { full_name: repository, id: repositoryId } } } },
      sourceBaseSha: state.baseSha, runtimeBaseSha: state.baseSha, token: 'read-only-token', ...contextInput }, contextFetchImpl: context.fetchImpl,
      runProtectedReview: async () => ({ ...reviewValue, ...reviewInput }),
      completeness: { token: 'read-only-token', fetchImpl: complete.fetchImpl },
      getApp: async () => { appCalls++; return getApp(); }, reportFetchImpl: reporter.fetchImpl, now },
  };
}

test('validates protected ordinary PASS and publishes the exact current test-merge subject', async () => {
  const f = input();
  const result = await publishProtectedSelfPrResult(f.value);
  assert.deepEqual(result, { id: 909, name: 'architecture-gate / accept', repository, headSha: states[0].subjectSha, conclusion: 'success', appId });
  assert.equal(f.context.calls, 10);
  assert.equal(f.complete.calls.length, 1);
  assert.equal(f.appCalls, 1);
  assert.equal(f.reporter.calls.length, 2);
});

test('a later unrelated tag observation does not classify or alter ordinary content', async () => {
  const state = states[0], f = input({ reviewValue: review(state, { laterTagObservation: 'present' }) });
  const result = await publishProtectedSelfPrResult(f.value);
  assert.equal(result.conclusion, 'success');
  assert.equal(f.appCalls, 1);
  assert.equal(f.reporter.calls.length, 2);
});

test('materializes the complete old manifest without imposing a six-member limit', async () => {
  const state = states[1], f = input({ state });
  const result = await publishProtectedSelfPrResult(f.value);
  assert.equal(result.conclusion, 'success');
  assert.equal(f.appCalls, 1);
});

test('does not access App credentials or publisher on review, policy, binding, provenance, or completeness failure', async t => {
  const state = states[0], baseProvenance = state.provenance;
  const cases = [
    ['skipped review', { reviewValue: review(state, { reviewResult: 'skipped' }) }],
    ['neutral review', { reviewValue: review(state, { reviewResult: 'neutral' }) }],
    ['failed policy', { reviewValue: review(state, { policyResult: 'failure' }) }],
    ['non-PASS decision', { reviewValue: review(state, { preparedReview: preparedReview(state, { ...decisionFor(state), decision: 'BLOCK' }) }) }],
    ['changed selected authority', { reviewValue: review(state, { selectedAuthorityChanged: 'true' }) }],
    ['stale PASS base binding', { reviewValue: review(state, { reviewBinding: { ...review(state).reviewBinding, baseSha: 'd'.repeat(40) } }) }],
    ['stale PASS head binding', { reviewValue: review(state, { reviewBinding: { ...review(state).reviewBinding, headSha: 'd'.repeat(40) } }) }],
    ['stale PASS reviewed subject binding', { reviewValue: review(state, { reviewBinding: { ...review(state).reviewBinding, reviewedSha: 'd'.repeat(40) } }) }],
    ['Authority provenance moved off old base', {
      reviewValue: review(state, {
        preparedReview: preparedReview(state, decisionFor(state), {
          ...baseProvenance,
          members: baseProvenance.members.map(member => ({ ...member, resolvedCommit: state.headSha })),
        }),
      }),
    }],
    ['Authority provenance omission', {
      reviewValue: review(state, {
        preparedReview: preparedReview(state, decisionFor(state), {
          ...baseProvenance,
          members: baseProvenance.members.slice(0, -1),
        }),
      }),
    }],
    ['Authority provenance extra member', {
      reviewValue: review(state, {
        preparedReview: preparedReview(state, decisionFor(state), {
          ...baseProvenance,
          members: [...baseProvenance.members, baseProvenance.members[0]],
        }),
      }),
    }],
    ['old Policy digest differs from protected base', { reviewValue: review(state, { authoritySelection: { ...review(state).authoritySelection,
      policySha256: 'd'.repeat(64) } }) }],
    ['wrong old base repository root', { reviewValue: review(state, { authoritySelection: { ...review(state).authoritySelection,
      root: states[1].root } }) }],
    ['incomplete PR description', { complete: completenessFixture(state, { valid: false }) }],
    ['stale final PR context', { context: contextFixture(state, { staleSecond: true }) }],
  ];
  for (const [name, fixture] of cases) await t.test(name, async () => {
    const f = input(fixture);
    const result = await publishProtectedSelfPrResult(f.value);
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(f.appCalls, 0);
    assert.equal(f.reporter.calls.length, 0);
  });
});

test('final PR readback rejects repository identity changes', async () => {
  const state = states[0], f = input({ context: contextFixture(state, { finalRepoMismatch: true }) });
  const result = await publishProtectedSelfPrResult(f.value);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(f.appCalls, 0);
});

test('does not invoke protected review or App callbacks when initial context is invalid', async () => {
  let reviewCalls = 0;
  const f = input({ contextInput: { eventName: 'pull_request' } });
  f.value.runProtectedReview = async () => { reviewCalls++; return review(states[0]); };
  const result = await publishProtectedSelfPrResult(f.value);
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(reviewCalls, 0);
  assert.equal(f.appCalls, 0);
});
