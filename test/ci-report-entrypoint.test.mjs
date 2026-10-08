import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digestDecision } from '../src/ci-report.mjs';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const entrypoint = join(sourceRoot, 'src/ci-report.mjs');
const hook = join(sourceRoot, 'test/fixtures/ci-report-entrypoint-hook.mjs');
const repo = 'flair-agency/architecture-gatekeeper';
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const reviewed = 'c'.repeat(40);

function fixtureRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'ci-report-entrypoint-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function runCli(root, overrides = {}, responseOverrides = {}) {
  const paths = Object.fromEntries(['summary', 'report', 'output', 'fixture', 'requests'].map(name => [name, join(root, name)]));
  for (const name of ['summary', 'report', 'output']) writeFileSync(paths[name], '');
  writeFileSync(paths.fixture, JSON.stringify({ responses: {
    [`GET /repos/${repo}/pulls/17`]: { json: { head: { sha: head } } },
    [`GET /repos/${repo}/pulls/17/files`]: { json: [{ filename: 'src/change.mjs', additions: 1, deletions: 0,
      patch: '@@ -0,0 +1 @@\n+export const changed = true;' }] },
    [`GET /repos/${repo}/pulls/17/comments`]: { json: [] },
    [`GET /repos/${repo}/issues/17/comments`]: { json: [] },
    [`POST /repos/${repo}/pulls/17/reviews`]: { json: { id: 12 } },
    [`POST /repos/${repo}/issues/17/comments`]: { json: { id: 13 } },
    ...responseOverrides,
  } }));
  const controlledNames = new Set([
    'MODE', 'POLICY_RESULT', 'REVIEW_RESULT', 'DECISION', 'POLICY_VERSION', 'BASE_SHA', 'HEAD_SHA', 'REVIEWED_SHA',
    'PR_NUMBER', 'RUN_URL', 'WORKFLOW_REF', 'GITHUB_REPOSITORY', 'GITHUB_API_URL', 'GITHUB_TOKEN',
    'GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'REPORT_PATH', 'AUTHORITY_PROVENANCE_BASE64', 'AUTHORITY_ROUTE_SELECTED',
    'LEGACY_AUTHORITY_PROVENANCE_BASE64', 'OWNER_ADDITION_SELECTED', 'OWNER_ADDITION_RESULT',
    'OWNER_ADDITION_ELIGIBILITY', 'OWNER_ADDITION_PROCEDURE_BASE64', 'CI_REPORT_FIXTURE', 'CI_REPORT_REQUEST_LOG',
  ]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !controlledNames.has(key) && !key.startsWith('GITHUB_')));
  Object.assign(env, {
    MODE: 'enforced', POLICY_RESULT: 'success', REVIEW_RESULT: 'success',
    DECISION: JSON.stringify({ decision: 'PASS', summary: 'Selected authority permits the change.', findings: [
      { title: 'Check the boundary', body: 'The new line preserves the selected boundary.', location: { path: 'src/change.mjs', line: 1, side: 'RIGHT' } },
    ] }),
    GITHUB_REPOSITORY: repo, PR_NUMBER: '17', BASE_SHA: base, HEAD_SHA: head, REVIEWED_SHA: reviewed,
    GITHUB_API_URL: 'https://api.github.com/', GITHUB_TOKEN: 'synthetic-test-token',
    GITHUB_STEP_SUMMARY: paths.summary, REPORT_PATH: paths.report, GITHUB_OUTPUT: paths.output,
    ...overrides,
    NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`,
  });
  let child;
  const fixtureFd = openSync(paths.fixture, 'r');
  try {
    const requestLogFd = openSync(paths.requests, 'w', 0o600);
    try {
      child = spawnSync(process.execPath, [entrypoint], { cwd: root, env, encoding: 'utf8', timeout: 15_000,
        stdio: ['ignore', 'pipe', 'pipe', fixtureFd, requestLogFd] });
    } finally {
      closeSync(requestLogFd);
    }
  } finally {
    closeSync(fixtureFd);
  }
  assert.equal(child.error, undefined, `ci-report child process could not be observed: ${child.error?.message || ''}`);
  assert.equal(child.signal, null, `ci-report child was interrupted (${child.signal})`);
  const fixtureLog = JSON.parse(readFileSync(paths.requests, 'utf8').trim());
  assert.deepEqual(fixtureLog.violations, [], 'synthetic fetch observed an unexpected origin or unconfigured route');
  return { ...child, paths, requests: fixtureLog.requests, violations: fixtureLog.violations,
    report: safeRead(paths.report), summary: safeRead(paths.summary), output: safeRead(paths.output) };
}

function safeRead(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function b64(value) { return Buffer.from(JSON.stringify(value)).toString('base64'); }
function authoritySet(memberSha256 = '4'.repeat(64)) {
  const member = { id: 'architecture-contract', repository: repo, resolvedCommit: base,
    path: 'docs/architecture.md', byteLength: 42, sha256: memberSha256 };
  const setDigest = createHash('sha256').update(JSON.stringify([member])).digest('hex');
  return { version: 2, selfRepository: repo, authorityRevision: base,
    manifestSha256: '1'.repeat(64), setDigest, members: [member] };
}
function procedure(patch = {}) {
  return {
    procedure: 'VALID_G0_OWNER_ADDITION', grade: 'G0', repository: repo, baseSha: base, headSha: head,
    policyRevision: base, authorityId: 'architecture-contract', authorityPath: 'docs/architecture.md',
    previousAuthoritySha256: 'd'.repeat(64), newAuthoritySha256: 'e'.repeat(64),
    missingDecisionId: 'selected-choice', additionRecordSha256: 'f'.repeat(64),
    tagRef: `refs/tags/architecture-owner-addition/${head}`, tagObjectOid: head,
    principalAuthentication: 'not_verified', semanticEligibility: 'requires_separate_protected_review',
    ...patch,
  };
}
function v2Procedure(set) {
  return {
    version: 2, procedure: 'VALID_G0_OWNER_ADDITION', grade: 'G0', repository: repo,
    baseSha: base, headSha: head, policyRevision: base, policySha256: '2'.repeat(64), authoritySet: set,
    authorityId: 'architecture-contract', authorityPath: 'docs/architecture.md',
    previousAuthoritySha256: set.members[0].sha256, newAuthoritySha256: 'e'.repeat(64),
    missingDecisionId: 'selected-choice', additionRecordSha256: 'f'.repeat(64),
    tagRef: `refs/tags/architecture-owner-addition/${head}`, tagObjectOid: head,
    principalAuthentication: 'not_verified', semanticEligibility: 'requires_separate_protected_review',
  };
}

const ownerDecision = JSON.stringify({ decision: 'OWNER_DECISION', ownerDecisionId: 'selected-choice', summary: 'A canonical choice remains open.' });

test('real ci-report CLI composes a validated PASS report, inline review, PR comment and output', t => {
  const result = runCli(fixtureRoot(t));
  const decision = { decision: 'PASS', summary: 'Selected authority permits the change.', findings: [
    { title: 'Check the boundary', body: 'The new line preserves the selected boundary.', location: { path: 'src/change.mjs', line: 1, side: 'RIGHT' } },
  ] };
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.report, /Architecture Gate — PASS/);
  assert.equal(result.summary, result.report);
  const digest = digestDecision(decision);
  assert.equal(result.output, `conclusion=PASS\ndecision_digest=${digest}\n`);
  const inlineRequest = result.requests.find(request => request.method === 'POST' && request.url.endsWith('/pulls/17/reviews'));
  const finding = decision.findings[0];
  const findingKey = createHash('sha256').update(JSON.stringify({ decision: 'PASS', head,
    title: finding.title, body: finding.body, location: finding.location })).digest('hex');
  assert.deepEqual(inlineRequest?.body?.comments, [{ path: 'src/change.mjs', line: 1, side: 'RIGHT',
    body: `**Architecture Gatekeeper — Check the boundary**\n\nThe new line preserves the selected boundary.\n\n<!-- architecture-gatekeeper:inline:v1:${findingKey} -->` }]);
  const reportRequest = result.requests.find(request => request.method === 'POST' && request.url.endsWith('/issues/17/comments'));
  assert.equal(reportRequest?.body?.body, result.report);
});

test('real ci-report CLI composes a validated BLOCK report and conclusion output', t => {
  const decision = { decision: 'BLOCK', summary: 'A required boundary is violated.' };
  const result = runCli(fixtureRoot(t), { DECISION: JSON.stringify(decision) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.report, /Architecture Gate — BLOCK/);
  assert.match(result.summary, /A required boundary is violated/);
  const digest = digestDecision(decision);
  assert.equal(result.output, `conclusion=BLOCK\ndecision_digest=${digest}\n`);
  const reportRequest = result.requests.find(request => request.method === 'POST' && request.url.endsWith('/issues/17/comments'));
  assert.equal(reportRequest?.body?.body, result.report);
});

test('real ci-report CLI renders a protected G0 result only from a matching successful procedure', t => {
  const result = runCli(fixtureRoot(t), { MODE: 'procedural', DECISION: ownerDecision,
    OWNER_ADDITION_SELECTED: 'true', OWNER_ADDITION_RESULT: 'success', OWNER_ADDITION_ELIGIBILITY: 'ELIGIBLE',
    OWNER_ADDITION_PROCEDURE_BASE64: b64(procedure()) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.report, /OWNER_ADDITION_G0_PENDING|OWNER_ADDITION \/ G0/);
  assert.match(result.report, /adoption and canonical placement: `pending`/);
  assert.match(result.report, /principal authentication and host enforcement: `not_verified`/);
  assert.match(result.output, /^conclusion=OWNER_ADDITION_G0_PENDING\n/);
});

test('real ci-report CLI accepts matching selected v2 provenance for a G0 procedure', t => {
  const selected = authoritySet();
  const decision = { decision: 'OWNER_DECISION', ownerDecisionId: 'selected-choice',
    summary: 'A canonical choice remains open.', authorityIds: ['architecture-contract'], authoritySetDigest: selected.setDigest };
  const result = runCli(fixtureRoot(t), { MODE: 'enforced', DECISION: JSON.stringify(decision),
    OWNER_ADDITION_SELECTED: 'true', OWNER_ADDITION_RESULT: 'success', OWNER_ADDITION_ELIGIBILITY: 'ELIGIBLE',
    OWNER_ADDITION_PROCEDURE_BASE64: b64(v2Procedure(selected)), AUTHORITY_ROUTE_SELECTED: 'true',
    AUTHORITY_PROVENANCE_BASE64: b64(selected) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.report, /Architecture Gate — OWNER_ADDITION \/ G0/);
  assert.match(result.report, new RegExp(selected.setDigest));
  assert.equal(result.output, `conclusion=OWNER_ADDITION_G0\ndecision_digest=${digestDecision(decision)}\n`);
});

test('real ci-report CLI rejects differing well-formed selected v2 and G0 provenance before any I/O or output', t => {
  const selected = authoritySet();
  const procedureSet = authoritySet('5'.repeat(64));
  const decision = { decision: 'OWNER_DECISION', ownerDecisionId: 'selected-choice',
    summary: 'A canonical choice remains open.', authorityIds: ['architecture-contract'], authoritySetDigest: procedureSet.setDigest };
  const result = runCli(fixtureRoot(t), { MODE: 'enforced', DECISION: JSON.stringify(decision),
    OWNER_ADDITION_SELECTED: 'true', OWNER_ADDITION_RESULT: 'success', OWNER_ADDITION_ELIGIBILITY: 'ELIGIBLE',
    OWNER_ADDITION_PROCEDURE_BASE64: b64(v2Procedure(procedureSet)), AUTHORITY_ROUTE_SELECTED: 'true',
    AUTHORITY_PROVENANCE_BASE64: b64(selected) });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /Multi-document Authority Set provenance is invalid or mismatched/);
  assert.deepEqual(result.requests, []);
  assert.equal(result.report, '');
  assert.equal(result.summary, '');
  assert.equal(result.output, '');
});

test('real ci-report CLI rejects wrong G0 repository, base, and head before report or output writes', t => {
  for (const mismatch of [
    { repository: 'other/project' },
    { baseSha: '9'.repeat(40), policyRevision: '9'.repeat(40) },
    { headSha: '8'.repeat(40), tagObjectOid: '8'.repeat(40), tagRef: `refs/tags/architecture-owner-addition/${'8'.repeat(40)}` },
  ]) {
    const root = fixtureRoot(t);
    const result = runCli(root, { DECISION: ownerDecision, OWNER_ADDITION_SELECTED: 'true', OWNER_ADDITION_RESULT: 'success',
      OWNER_ADDITION_ELIGIBILITY: 'ELIGIBLE', OWNER_ADDITION_PROCEDURE_BASE64: b64(procedure(mismatch)) });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /does not match this pull request/);
    assert.deepEqual(result.requests, []);
    assert.equal(result.report, '');
    assert.equal(result.summary, '');
    assert.equal(result.output, '');
  }
});

test('real ci-report CLI requires and validates selected Authority Set and legacy evidence before output', t => {
  const root = fixtureRoot(t);
  const missing = runCli(root, { AUTHORITY_ROUTE_SELECTED: 'true' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing Authority Set provenance/);
  assert.deepEqual(missing.requests, []);
  assert.equal(missing.report, '');
  assert.equal(missing.summary, '');
  assert.equal(missing.output, '');
  const malformed = runCli(fixtureRoot(t), { AUTHORITY_ROUTE_SELECTED: 'true', AUTHORITY_PROVENANCE_BASE64: 'not-base64!' });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /Invalid Authority Set provenance output/);
  assert.deepEqual(malformed.requests, []);
  assert.equal(malformed.report, '');
  assert.equal(malformed.summary, '');
  assert.equal(malformed.output, '');

  const provenance = { version: 1, baseSha: base, headSha: head, reviewedSha: reviewed,
    policy: { path: '.codex/gatekeeper/ci-policy.json', sha256: '1'.repeat(64) },
    prompt: { path: '.codex/gatekeeper/review.prompt', sha256: '2'.repeat(64) },
    schema: { path: '.codex/gatekeeper/decision.schema.json', sha256: '3'.repeat(64) },
    validation: null, members: [{ path: 'docs/architecture.md', sha256: '4'.repeat(64) }] };
  for (const mutation of [{ baseSha: '9'.repeat(40) }, { headSha: '8'.repeat(40) }, { reviewedSha: '7'.repeat(40) }]) {
    const result = runCli(fixtureRoot(t), { POLICY_VERSION: '1', LEGACY_AUTHORITY_PROVENANCE_BASE64: b64({ ...provenance, ...mutation }) });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Legacy authority provenance does not match this pull request/);
    assert.deepEqual(result.requests, []);
    assert.equal(result.report, '');
    assert.equal(result.summary, '');
    assert.equal(result.output, '');
  }
  const matchedLegacy = runCli(fixtureRoot(t), { POLICY_VERSION: '1', LEGACY_AUTHORITY_PROVENANCE_BASE64: b64(provenance) });
  assert.equal(matchedLegacy.status, 0, matchedLegacy.stderr);
  assert.match(matchedLegacy.report, /Recorded-base legacy review inputs/);
  assert.equal(matchedLegacy.summary, matchedLegacy.report);
});

test('real ci-report CLI accepts a matching selected v2 Authority Set and reports its bound descriptor', t => {
  const provenance = authoritySet();
  const result = runCli(fixtureRoot(t), { AUTHORITY_ROUTE_SELECTED: 'true', AUTHORITY_PROVENANCE_BASE64: b64(provenance) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.report, /Selected Authority Set/);
  assert.match(result.report, /architecture-contract: flair-agency\/architecture-gatekeeper/);
  assert.match(result.report, new RegExp(provenance.setDigest));
  assert.equal(result.summary, result.report);
});

test('real ci-report CLI defers inline success when the live head is stale and records the fallback', t => {
  const root = fixtureRoot(t);
  const result = runCli(root, {}, { [`GET /repos/${repo}/pulls/17`]: { json: { head: { sha: '9'.repeat(40) } } } });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.requests.map(request => request.url).join('\n'), /\/pulls\/17\/reviews$/);
  assert.match(result.report, /Inline review status: fallback: pull request head changed during reporting/);
  assert.match(result.output, /^conclusion=PASS\n/);
});

test('real ci-report CLI exposes publication failure in its report while preserving local outputs', t => {
  const root = fixtureRoot(t);
  const result = runCli(root, {}, { [`POST /repos/${repo}/issues/17/comments`]: { status: 503, json: { message: 'synthetic failure' } } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /comment unavailable.*create comment returned HTTP 503/);
  assert.match(result.report, /Architecture Gate — PASS/);
  assert.match(result.output, /^conclusion=PASS\n/);
  assert.ok(result.requests.some(request => request.url.endsWith('/issues/17/comments')));
});

test('real ci-report CLI fails closed when the selected output sink cannot be written', t => {
  const root = fixtureRoot(t);
  const outputDirectory = join(root, 'output-directory');
  mkdirSync(outputDirectory);
  const result = runCli(root, { GITHUB_OUTPUT: outputDirectory });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /EISDIR|illegal operation on a directory/);
  assert.equal(result.requests.some(request => request.method === 'POST' && request.url.endsWith('/issues/17/comments')), true);
});
