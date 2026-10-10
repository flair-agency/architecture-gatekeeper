import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
const publicationModule = new URL('../dist/ordinary-gemini-ci-publication.mjs', import.meta.url);
const { createOrdinaryGeminiPublication, emitOrdinaryGeminiPublication,
  parseOrdinaryGeminiPublicationLog, retrieveOrdinaryGeminiPublication, ORDINARY_GEMINI_PUBLICATION_FRAME,
  ORDINARY_GEMINI_PUBLICATION_STEP, MAX_ORDINARY_GEMINI_PROJECTION_BYTES } = await import(publicationModule);
const { digestDecision, renderReport, postInlineReview, main: runCiReport } =
  await import(new URL('../dist/ci-report.mjs', import.meta.url));
const { validatePreparedCiDecision } = await import(new URL('../dist/prepared-ci-decision.mjs', import.meta.url));

async function withProcessEnv(values, action) {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = String(value);
  }
  try { return await action(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function setRunnerTemp(t, value) {
  const previous = process.env.RUNNER_TEMP;
  process.env.RUNNER_TEMP = value;
  t.after(() => {
    if (previous === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previous;
  });
}

const sha = char => char.repeat(40);
const context = () => ({ repository: 'flair-agency/architecture-gatekeeper', runId: '712345', runAttempt: '2',
  eventSha: sha('a'), callerWorkflowSha: sha('b'), callerWorkflowRef: 'flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml@refs/heads/main',
  workflowRepository: 'flair-agency/architecture-gatekeeper', workflowSha: sha('c'),
  workflowRef: 'flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate-consumer.yml@refs/heads/main',
  baseSha: sha('d'), headSha: sha('e'), reviewedSha: sha('f'), provider: 'gemini' });
const decision = outcome => ({ decision: outcome, summary: 'candidate includes fixture-secret', findings: [
  { title: 'Authority mismatch', body: 'candidate includes fixture-secret', location: { path: 'src/example.mjs', line: 8, side: 'RIGHT' } },
], authorityIds: ['architecture-contract', 'architecture-authority-set'], authority: ['six selected authority files'],
  authorityFiles: ['docs/architecture.md', 'docs/architecture/member-1.md'], responsibility: ['shared gatekeeper'],
  capabilitySurface: ['ordinary protected workflow'], qualityGuarantees: ['fail closed'], reviewedScope: ['Issue 334 integration'],
  prohibitedChanges: ['do not activate main Gemini'], gates: { sharedMechanism: { decision: outcome,
    summary: 'Shared runner remains bounded.', consumerOwnership: 'consumer-owned', failClosedBehavior: 'fails closed',
    compatibility: 'Codex unchanged', minimality: 'one profile' }, trustBoundary: { decision: outcome,
    summary: 'Only protected inputs are used.', tokenPermissions: 'job-scoped', untrustedInputs: 'candidate only',
    credentialHandling: 'parent-held', reportingIsolation: 'masked log projection' } } });
const provenance = { version: 1, manifestSha256: '1'.repeat(64), setDigest: '2'.repeat(64), members: [
  { id: 'architecture-contract', repository: 'flair-agency/architecture-gatekeeper', resolvedCommit: sha('c'), path: 'docs/architecture.md', sha256: '3'.repeat(64) },
] };
function makeProjection(outcome = 'PASS') {
  const value = decision(outcome);
  return createOrdinaryGeminiPublication({ context: context(), decision: value, authorityProvenance: provenance,
    policyVersion: '6', mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    conclusion: outcome, decisionDigest: digestDecision(value) });
}
function makeNearDecisionLimitProjection(outcome = 'PASS') {
  const ids = ['architecture-contract', 'architecture-authority-set', 'architecture-owner-addition',
    'architecture-owner-amendment', 'architecture-review-execution', 'architecture-self-profile'];
  const paths = ['docs/architecture.md', 'docs/architecture/authority-set.md', 'docs/architecture/owner-addition.md',
    'docs/architecture/owner-amendment.md', 'docs/architecture/review-execution.md', 'docs/architecture/self-profile.md'];
  const selectedProvenance = { version: 1, manifestSha256: '1'.repeat(64), setDigest: '2'.repeat(64), members: ids.map((id, index) => ({
    id, repository: context().repository, resolvedCommit: sha('c'), path: paths[index], sha256: `${index + 3}`.repeat(64),
  })) };
  const value = decision(outcome);
  value.authorityIds = ids;
  value.authorityFiles = paths;
  value.summary = '';
  const responseLimit = 65_536;
  const baseBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  const targetBytes = 65_500;
  value.summary = 'x'.repeat(targetBytes - baseBytes);
  const responseBytes = Buffer.from(JSON.stringify(value), 'utf8');
  assert.equal(responseBytes.length, targetBytes);
  const schemaBytes = readFileSync(new URL('../.codex/gatekeeper/ci-decision.schema.json', import.meta.url));
  const validationRules = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/decision.validation.json', import.meta.url), 'utf8'));
  assert.deepEqual(validatePreparedCiDecision({ responseBytes, schemaBytes, authorityProvenance: selectedProvenance,
    validationRules, maxResponseBytes: responseLimit, maxSchemaBytes: 1_048_576 }), value);
  return createOrdinaryGeminiPublication({ context: context(), decision: value, authorityProvenance: selectedProvenance,
    policyVersion: '6', mode: 'enforced', policyResult: 'success', reviewResult: 'success', conclusion: outcome,
    decisionDigest: digestDecision(value) });
}
function expected(projection) {
  return { ...projection.context, conclusion: projection.report.validatedConclusion,
    decisionDigest: projection.report.validatedDecisionDigest };
}
function referencedWorkflow(value, overrides = {}) {
  const reference = value.workflowRef.slice(value.workflowRepository.length + 1);
  const at = reference.indexOf('@');
  const path = reference.slice(0, at);
  const ref = reference.slice(at + 1);
  return { path: `${value.workflowRepository}/${path}@${value.workflowSha}`, ref, sha: value.workflowSha, ...overrides };
}
function maskedLog(projection) {
  const lines = [];
  emitOrdinaryGeminiPublication(projection, line => lines.push(line));
  return lines.join('').replaceAll('candidate includes fixture-secret', 'candidate includes ***');
}

test('masked PASS and BLOCK publication retains the full display report and binds the original semantic digest', () => {
  for (const outcome of ['PASS', 'BLOCK']) {
    const projection = makeProjection(outcome);
    const log = maskedLog(projection);
    assert.match(log, /::stop-commands::agk_ordinary_[a-f0-9]{64}/);
    assert.match(log, /::agk_ordinary_[a-f0-9]{64}::/);
    const parsed = parseOrdinaryGeminiPublicationLog(log, expected(projection));
    assert.equal(parsed.report.validatedConclusion, outcome);
    assert.equal(parsed.report.validatedDecisionDigest, digestDecision(decision(outcome)));
    assert.equal(parsed.report.decision.summary, 'candidate includes ***');
    assert.equal(parsed.report.decision.findings[0].body, 'candidate includes ***');
    assert.equal(parsed.report.authorityProvenance.members[0].path, 'docs/architecture.md');
    const report = renderReport({ conclusion: outcome, summary: parsed.report.decision.summary,
      decision: parsed.report.decision }, { reviewedSha: context().reviewedSha, headSha: context().headSha,
      decisionDigest: parsed.report.validatedDecisionDigest, authorityProvenance: parsed.report.authorityProvenance,
      repository: context().repository });
    assert.match(report, /candidate includes \*\*\*/);
    assert.match(report, /Authority mismatch/);
    assert.match(report, /Per-gate evaluation details/);
    assert.match(report, /Selected Authority Set/);
    assert.match(report, /Resolved members/);
    assert.match(report, /Decision SHA-256/);
  }
});

test('publication parsing rejects missing, duplicate, truncated, altered, or differently bound frames', () => {
  const projection = makeProjection('BLOCK');
  const log = maskedLog(projection);
  assert.throws(() => parseOrdinaryGeminiPublicationLog('no report frame', expected(projection)));
  assert.throws(() => parseOrdinaryGeminiPublicationLog(`${log}${log}`, expected(projection)));
  const frameStart = log.indexOf(ORDINARY_GEMINI_PUBLICATION_FRAME);
  assert.throws(() => parseOrdinaryGeminiPublicationLog(log.slice(0, frameStart + ORDINARY_GEMINI_PUBLICATION_FRAME.length + 32), expected(projection)));
  for (const changes of [
    { runAttempt: '1' }, { provider: 'codex' }, { conclusion: 'PASS' }, { decisionDigest: '0'.repeat(64) },
    { nonce: '0'.repeat(48) }, { workflowSha: sha('9') }, { callerWorkflowSha: sha('8') }, { eventSha: sha('9') },
  ]) assert.throws(() => parseOrdinaryGeminiPublicationLog(log, { ...expected(projection), ...changes }));
  const altered = log.replace('"validatedConclusion":"BLOCK"', '"validatedConclusion":"PASS"');
  assert.throws(() => parseOrdinaryGeminiPublicationLog(altered, expected(projection)));
});

test('publication permits a valid decision near the bounded projection ceiling and rejects an oversized projection', () => {
  const projection = makeNearDecisionLimitProjection('BLOCK');
  const largeDecision = projection.report.decision;
  const decisionBytes = Buffer.byteLength(JSON.stringify(largeDecision), 'utf8');
  const bytes = Buffer.byteLength(JSON.stringify(projection), 'utf8');
  assert.ok(decisionBytes <= 65_536, 'the shared prepared-decision validator accepted it under its response ceiling');
  assert.ok(bytes > 65_536, 'valid decision plus protected metadata exceeds the former 65 KiB projection ceiling');
  assert.ok(bytes < MAX_ORDINARY_GEMINI_PROJECTION_BYTES);
  const log = maskedLog(projection);
  assert.ok(Buffer.byteLength(log, 'utf8') < 1_048_576, 'frame remains below the bounded job-log ceiling');
  assert.equal(parseOrdinaryGeminiPublicationLog(log, expected(projection)).report.validatedConclusion, 'BLOCK');

  largeDecision.summary = 'x'.repeat(MAX_ORDINARY_GEMINI_PROJECTION_BYTES);
  assert.throws(() => createOrdinaryGeminiPublication({ context: context(), decision: largeDecision, authorityProvenance: provenance,
    policyVersion: '6', mode: 'enforced', policyResult: 'success', reviewResult: 'success', conclusion: 'BLOCK',
    decisionDigest: digestDecision(largeDecision) }), /fixed boundary check/);
});

test('fetch selects one completed attributed job, verifies the protected tuple, and writes a private projection', async t => {
  const projection = makeProjection('BLOCK');
  const tuple = expected(projection);
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-publication-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const temp = join(parent, 'runner-temp');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(temp, { mode: 0o700 });
  const outputPath = join(temp, `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
  const log = maskedLog(projection);
  const run = { id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    path: '.github/workflows/architecture-gate.yml', repository: { full_name: tuple.repository },
    referenced_workflows: [referencedWorkflow(tuple)] };
  const job = { id: 9981, run_id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    status: 'completed', conclusion: 'success', steps: [{ name: ORDINARY_GEMINI_PUBLICATION_STEP, status: 'completed', conclusion: 'success' }] };
  const requests = [];
  const fakeFetch = async (url, options) => {
    const value = String(url);
    requests.push({ url: value, options });
    if (value.endsWith(`/attempts/${tuple.runAttempt}`)) return Response.json(run);
    if (value.endsWith(`/attempts/${tuple.runAttempt}/jobs?per_page=100`)) return Response.json({ total_count: 1, jobs: [job] });
    if (value.endsWith(`/actions/jobs/${job.id}/logs`)) return new Response(null, { status: 302, headers: { location: 'https://signed.blob.core.windows.net/logs/x' } });
    if (value === 'https://signed.blob.core.windows.net/logs/x') return new Response(log, { status: 200 });
    throw new Error('unexpected fetch URL');
  };
  setRunnerTemp(t, temp);
  const fetched = await retrieveOrdinaryGeminiPublication({ apiToken: 'fixture-github-token', expected: tuple, outputPath, fetchImpl: fakeFetch });
  assert.equal(fetched.report.validatedConclusion, 'BLOCK');
  assert.match(readFileSync(outputPath, 'utf8'), /candidate includes \*\*\*/);
  assert.equal(statSync(outputPath).mode & 0o777, 0o600);
  assert.equal(requests.length, 4);
  assert.equal(requests[0].options.headers.authorization, 'Bearer fixture-github-token');
  assert.equal(requests[3].options.headers.authorization, undefined, 'signed log host receives no GitHub credential');
});

test('fetch accepts SHA-pinned reusable workflow metadata when GitHub omits ref', async t => {
  const pinned = { ...context(), workflowRef: `flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate-consumer.yml@${sha('c')}` };
  const value = createOrdinaryGeminiPublication({ context: pinned, decision: decision('PASS'), authorityProvenance: provenance,
    policyVersion: '6', mode: 'enforced', policyResult: 'success', reviewResult: 'success', conclusion: 'PASS',
    decisionDigest: digestDecision(decision('PASS')) });
  const tuple = expected(value);
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-pinned-reference-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const temp = join(parent, 'runner-temp'); const { mkdirSync } = await import('node:fs'); mkdirSync(temp, { mode: 0o700 });
  setRunnerTemp(t, temp);
  const outputPath = join(temp, `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
  const run = { id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    path: '.github/workflows/architecture-gate.yml', repository: { full_name: tuple.repository },
    referenced_workflows: [{ path: `${tuple.workflowRepository}/.github/workflows/architecture-gate-consumer.yml@${tuple.workflowSha}`, sha: tuple.workflowSha }] };
  const job = { id: 9981, run_id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    status: 'completed', conclusion: 'success', steps: [{ name: ORDINARY_GEMINI_PUBLICATION_STEP, status: 'completed', conclusion: 'success' }] };
  const log = maskedLog(value);
  const fakeFetch = async url => {
    const request = String(url);
    if (request.endsWith(`/attempts/${tuple.runAttempt}`)) return Response.json(run);
    if (request.endsWith(`/attempts/${tuple.runAttempt}/jobs?per_page=100`)) return Response.json({ total_count: 1, jobs: [job] });
    if (request.endsWith(`/actions/jobs/${job.id}/logs`)) return new Response(null, { status: 302, headers: { location: 'https://signed.blob.core.windows.net/logs/pinned' } });
    if (request === 'https://signed.blob.core.windows.net/logs/pinned') return new Response(log);
    throw new Error('unexpected fetch URL');
  };
  const fetched = await retrieveOrdinaryGeminiPublication({ apiToken: 'fixture', expected: tuple, outputPath, fetchImpl: fakeFetch });
  assert.equal(fetched.report.validatedConclusion, 'PASS');
});

test('run.path accepts plain and ref-qualified REST forms only for the protected caller workflow ref', async t => {
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-caller-path-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const temp = join(parent, 'runner-temp'); const { mkdirSync } = await import('node:fs'); mkdirSync(temp, { mode: 0o700 });
  setRunnerTemp(t, temp);

  const cases = [
    { kind: 'plain', path: '.github/workflows/architecture-gate.yml' },
    { kind: 'full-branch-ref', path: '.github/workflows/architecture-gate.yml@refs/heads/main' },
    { kind: 'short-branch-ref', path: '.github/workflows/architecture-gate.yml@main' },
    { kind: 'wrong-branch-ref', path: '.github/workflows/architecture-gate.yml@refs/heads/attacker', reject: true },
    { kind: 'short-tag-ref', callerRef: 'refs/tags/release-v1', path: '.github/workflows/architecture-gate.yml@release-v1' },
    { kind: 'tag-as-branch', callerRef: 'refs/tags/release-v1', path: '.github/workflows/architecture-gate.yml@refs/heads/release-v1', reject: true },
    { kind: 'branch-at-short', callerRef: 'refs/heads/release@next', path: '.github/workflows/architecture-gate.yml@release@next' },
    { kind: 'branch-at-full', callerRef: 'refs/heads/release@next', path: '.github/workflows/architecture-gate.yml@refs/heads/release@next' },
    { kind: 'branch-at-wrong', callerRef: 'refs/heads/release@next', path: '.github/workflows/architecture-gate.yml@release@other', reject: true },
    { kind: 'tag-at-short', callerRef: 'refs/tags/release@next', path: '.github/workflows/architecture-gate.yml@release@next' },
    { kind: 'reusable-branch-at', reusableRef: 'refs/heads/release@next', path: '.github/workflows/architecture-gate.yml' },
    { kind: 'caller-other-repository', repository: 'other/repository', reject: true },
  ];
  for (const [index, scenario] of cases.entries()) {
    const callerContext = { ...context(), runId: String(712350 + index) };
    if (scenario.callerRef) callerContext.callerWorkflowRef = `${callerContext.repository}/.github/workflows/architecture-gate.yml@${scenario.callerRef}`;
    if (scenario.reusableRef) callerContext.workflowRef = `${callerContext.workflowRepository}/.github/workflows/architecture-gate-consumer.yml@${scenario.reusableRef}`;
    if (scenario.repository) callerContext.callerWorkflowRef = `${scenario.repository}/.github/workflows/architecture-gate.yml@refs/heads/main`;
    const value = createOrdinaryGeminiPublication({ context: callerContext, decision: decision('PASS'), authorityProvenance: provenance,
      policyVersion: '6', mode: 'enforced', policyResult: 'success', reviewResult: 'success', conclusion: 'PASS',
      decisionDigest: digestDecision(decision('PASS')) });
    const tuple = expected(value);
    const path = scenario.path ?? '.github/workflows/architecture-gate.yml';
    const run = { id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha, path,
      repository: { full_name: tuple.repository }, referenced_workflows: [referencedWorkflow(tuple)] };
    const job = { id: 9981, run_id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
      status: 'completed', conclusion: 'success', steps: [{ name: ORDINARY_GEMINI_PUBLICATION_STEP, status: 'completed', conclusion: 'success' }] };
    const log = maskedLog(value);
    const fakeFetch = async url => {
      const request = String(url);
      if (request.endsWith(`/attempts/${tuple.runAttempt}`)) return Response.json(run);
      if (request.endsWith(`/attempts/${tuple.runAttempt}/jobs?per_page=100`)) return Response.json({ total_count: 1, jobs: [job] });
      if (request.endsWith(`/actions/jobs/${job.id}/logs`)) return new Response(null, { status: 302, headers: { location: `https://signed.blob.core.windows.net/logs/${tuple.runId}` } });
      if (request === `https://signed.blob.core.windows.net/logs/${tuple.runId}`) return new Response(log);
      throw new Error('unexpected fetch URL');
    };
    const outputPath = join(temp, `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
    if (scenario.reject) {
      await assert.rejects(retrieveOrdinaryGeminiPublication({ apiToken: 'fixture', expected: tuple, outputPath, fetchImpl: fakeFetch }));
    } else {
      const fetched = await retrieveOrdinaryGeminiPublication({ apiToken: 'fixture', expected: tuple, outputPath, fetchImpl: fakeFetch });
      assert.equal(fetched.report.validatedConclusion, 'PASS');
    }
  }
});

test('fetch rejects ambiguous job attribution and wrong run-attempt metadata', async t => {
  const projection = makeProjection();
  const tuple = expected(projection);
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-reject-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const temp = join(parent, 'runner-temp');
  const { mkdirSync } = await import('node:fs'); mkdirSync(temp);
  setRunnerTemp(t, temp);
  const outputPath = join(temp, `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
  const baseRun = { id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    path: '.github/workflows/architecture-gate.yml', repository: { full_name: tuple.repository },
    referenced_workflows: [referencedWorkflow(tuple)] };
  const baseJob = { id: 9981, run_id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    status: 'completed', conclusion: 'success', steps: [{ name: ORDINARY_GEMINI_PUBLICATION_STEP, status: 'completed', conclusion: 'success' }] };
  for (const scenario of ['duplicate', 'wrong-attempt', 'wrong-run-head', 'wrong-job-head', 'missing-branch-ref', 'wrong-repository', 'wrong-ref', 'wrong-sha']) {
    const goodReference = referencedWorkflow(tuple);
    const badReference = scenario === 'wrong-repository'
      ? { ...goodReference, path: goodReference.path.replace(tuple.workflowRepository, 'other/repository') }
      : scenario === 'wrong-ref' ? { ...goodReference, ref: 'refs/heads/attacker' }
        : { ...goodReference, path: goodReference.path.replace(tuple.workflowSha, sha('9')), sha: sha('9') };
    const runForScenario = scenario === 'wrong-attempt' ? { ...baseRun, run_attempt: 1 }
      : scenario === 'wrong-run-head' ? { ...baseRun, head_sha: tuple.eventSha }
        : scenario === 'missing-branch-ref' ? { ...baseRun, referenced_workflows: [{ path: goodReference.path, sha: goodReference.sha }] }
          : scenario.startsWith('wrong-') ? { ...baseRun, referenced_workflows: [badReference] } : baseRun;
    const fakeFetch = async url => {
      const value = String(url);
      if (value.endsWith(`/attempts/${tuple.runAttempt}`)) return Response.json(runForScenario);
      if (value.endsWith(`/attempts/${tuple.runAttempt}/jobs?per_page=100`)) return Response.json({ total_count: 2,
        jobs: scenario === 'duplicate' ? [baseJob, { ...baseJob, id: 9982 }]
        : scenario === 'wrong-job-head' ? [{ ...baseJob, head_sha: tuple.eventSha }] : [baseJob] });
      throw new Error('unexpected log retrieval after rejected metadata');
    };
    await assert.rejects(retrieveOrdinaryGeminiPublication({ apiToken: 'fixture', expected: tuple, outputPath, fetchImpl: fakeFetch }));
  }
});

test('fetch rejects non-GitHub redirect hosts and a stalled API call before an unbounded wait', async t => {
  const projection = makeProjection();
  const tuple = expected(projection);
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-timeout-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const temp = join(parent, 'runner-temp');
  const { mkdirSync } = await import('node:fs'); mkdirSync(temp);
  setRunnerTemp(t, temp);
  const outputPath = join(temp, `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
  const run = { id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    path: '.github/workflows/architecture-gate.yml', repository: { full_name: tuple.repository },
    referenced_workflows: [referencedWorkflow(tuple)] };
  const job = { id: 9981, run_id: Number(tuple.runId), run_attempt: Number(tuple.runAttempt), head_sha: tuple.headSha,
    status: 'completed', conclusion: 'success', steps: [{ name: ORDINARY_GEMINI_PUBLICATION_STEP, status: 'completed', conclusion: 'success' }] };
  let calls = 0;
  const redirectFetch = async url => {
    calls += 1;
    const value = String(url);
    if (value.endsWith(`/attempts/${tuple.runAttempt}`)) return Response.json(run);
    if (value.endsWith(`/attempts/${tuple.runAttempt}/jobs?per_page=100`)) return Response.json({ total_count: 1, jobs: [job] });
    if (value.endsWith(`/actions/jobs/${job.id}/logs`)) return new Response(null, { status: 302, headers: { location: 'https://example.invalid/steal-log' } });
    throw new Error('forbidden redirect was followed');
  };
  await assert.rejects(retrieveOrdinaryGeminiPublication({ apiToken: 'fixture', expected: tuple, outputPath, fetchImpl: redirectFetch }));
  assert.equal(calls, 3, 'foreign redirect target is rejected before network access');
  const started = Date.now();
  await assert.rejects(retrieveOrdinaryGeminiPublication({ apiToken: 'fixture', expected: tuple, outputPath,
    timeoutMs: 10, fetchImpl: () => new Promise(() => {}) }));
  assert.ok(Date.now() - started < 1_000, 'hung fetch is bounded by the request deadline');
});

test('selected Gemini report fails closed on missing or altered projection and never uses raw DECISION fallback', async t => {
  const projection = makeProjection('BLOCK');
  const tuple = expected(projection);
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-report-bind-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const temp = join(parent, 'runner-temp');
  const { mkdirSync, writeFileSync, chmodSync } = await import('node:fs'); mkdirSync(temp);
  const path = join(temp, `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
  const env = { REPORT_PROJECTION_PATH: path, REPORT_EXPECTED_PROVIDER: 'gemini', REPORT_EXPECTED_NONCE: tuple.nonce,
    REPORT_EXPECTED_CONCLUSION: tuple.conclusion, REPORT_EXPECTED_DECISION_DIGEST: tuple.decisionDigest,
    GITHUB_REPOSITORY: tuple.repository, GITHUB_RUN_ID: tuple.runId, GITHUB_RUN_ATTEMPT: tuple.runAttempt,
    GITHUB_SHA: tuple.eventSha, GITHUB_WORKFLOW_SHA: tuple.callerWorkflowSha, GITHUB_WORKFLOW_REF: tuple.callerWorkflowRef,
    GATEKEEPER_WORKFLOW_REPOSITORY: tuple.workflowRepository, GATEKEEPER_WORKFLOW_SHA: tuple.workflowSha,
    GATEKEEPER_WORKFLOW_REF: tuple.workflowRef, BASE_SHA: tuple.baseSha, HEAD_SHA: tuple.headSha,
    REVIEWED_SHA: tuple.reviewedSha, RUNNER_TEMP: temp, POLICY_VERSION: '6', MODE: 'enforced',
    POLICY_RESULT: 'success', REVIEW_RESULT: 'success' };
  await withProcessEnv(env, async () => assert.rejects(runCiReport(), /ENOENT/));
  writeFileSync(path, ' '.repeat(MAX_ORDINARY_GEMINI_PROJECTION_BYTES + 2), { mode: 0o600 }); chmodSync(path, 0o600);
  await withProcessEnv(env, async () => assert.rejects(runCiReport(), /protected binding checks/));
  writeFileSync(path, `${JSON.stringify(projection)}\n`, { mode: 0o600 }); chmodSync(path, 0o600);
  const altered = { ...env, REPORT_EXPECTED_CONCLUSION: 'PASS' };
  await withProcessEnv(altered, async () => assert.rejects(runCiReport(), /protected binding checks/));
  await withProcessEnv({ REPORT_EXPECTED_PROVIDER: 'gemini', REPORT_PROJECTION_PATH: '',
    DECISION: JSON.stringify(decision('PASS')), MODE: 'enforced', POLICY_RESULT: 'success', REVIEW_RESULT: 'success' },
  async () => assert.rejects(runCiReport(), /no masked publication projection/));
});

test('full projected findings publish only against the current protected PR head and added diff lines', async () => {
  const projection = makeProjection('BLOCK');
  const expectedHead = context().headSha;
  const urls = [];
  const fetchImpl = async (url, options = {}) => {
    const value = String(url); urls.push({ url: value, options });
    if (value.endsWith('/pulls/77') && options.method !== 'POST') return Response.json({ head: { sha: expectedHead } });
    if (value.endsWith('/pulls/77/files?per_page=100&page=1')) return Response.json([
      { filename: 'src/example.mjs', status: 'added', additions: 1, deletions: 0, patch: '@@ -0,0 +8 @@\n+new line' },
    ]);
    if (value.endsWith('/pulls/77/comments?per_page=100&page=1')) return Response.json([]);
    if (value.endsWith('/pulls/77/reviews') && options.method === 'POST') return Response.json({}, { status: 200 });
    throw new Error(`unexpected report API request ${value}`);
  };
  const delivery = await postInlineReview({ fetchImpl, apiUrl: 'https://api.github.com', repository: context().repository,
    pullRequest: '77', token: 'fixture-token', expectedHead, decision: projection.report.decision.decision,
    findings: projection.report.decision.findings });
  assert.equal(delivery.status, 'created');
  const post = urls.find(item => item.url.endsWith('/pulls/77/reviews'));
  const payload = JSON.parse(post.options.body);
  assert.equal(payload.commit_id, expectedHead);
  assert.equal(payload.comments[0].line, 8);
  assert.match(payload.comments[0].body, /Authority mismatch/);

  const stale = await postInlineReview({ fetchImpl: async url => {
    assert.ok(String(url).endsWith('/pulls/77'));
    return Response.json({ head: { sha: sha('9') } });
  }, apiUrl: 'https://api.github.com', repository: context().repository, pullRequest: '77', token: 'fixture-token',
  expectedHead, decision: 'BLOCK', findings: projection.report.decision.findings });
  assert.equal(stale.status, 'fallback');
});

test('ci-report publishes full projected PASS/BLOCK bodies and emits outputs only after successful publication', async t => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'ordinary-gemini-ci-report-main-')));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const temp = join(parent, 'runner-temp');
  const { mkdirSync } = await import('node:fs'); mkdirSync(temp, { mode: 0o700 });

  for (const outcome of ['PASS', 'BLOCK', 'large-projection', 'host-sink-binding', 'publish-failure']) {
    const protectedOutcome = outcome === 'publish-failure' ? 'BLOCK' : outcome === 'large-projection' || outcome === 'host-sink-binding' ? 'PASS' : outcome;
    const projection = outcome === 'large-projection' ? makeNearDecisionLimitProjection('PASS') : makeProjection(protectedOutcome);
    if (outcome !== 'large-projection') projection.report.decision.summary = 'candidate includes ***';
    projection.report.decision.findings[0].body = 'candidate includes ***';
    const tuple = expected(projection);
    const projectionPath = join(temp, `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
    const summaryPath = join(temp, `${outcome}-summary.md`);
    const hostReportPath = join(temp, `${outcome}-host-report.md`);
    const outputPath = join(temp, `${outcome}-output.txt`);
    const candidateReportPath = join(parent, `${outcome}-candidate-report.md`);
    const candidateSummaryPath = join(parent, `${outcome}-candidate-summary.md`);
    const candidateProjectionPath = join(parent, `${outcome}-candidate-projection.json`);
    const candidateOutputPath = join(parent, `${outcome}-candidate-output.txt`);
    if (outcome === 'host-sink-binding') {
      for (const path of [candidateReportPath, candidateSummaryPath, candidateProjectionPath, candidateOutputPath]) {
        writeFileSync(path, 'candidate must not choose this file');
      }
      const hostileFields = { REPORT_PATH: candidateReportPath, GITHUB_STEP_SUMMARY: candidateSummaryPath,
        REPORT_PROJECTION_PATH: candidateProjectionPath, GITHUB_OUTPUT: candidateOutputPath };
      Object.assign(projection, hostileFields);
      Object.assign(projection.report, hostileFields);
      Object.assign(projection.report.decision, hostileFields);
    }
    writeFileSync(projectionPath, `${JSON.stringify(projection)}\n`, { mode: 0o600 }); chmodSync(projectionPath, 0o600);
    if (outcome === 'large-projection') {
      assert.ok(statSync(projectionPath).size > 65_536, 'report reader must accept a valid projection above the former 65 KiB limit');
      assert.ok(statSync(projectionPath).size <= MAX_ORDINARY_GEMINI_PROJECTION_BYTES + 1);
    }
    writeFileSync(outputPath, '');
    const env = { REPORT_PROJECTION_PATH: projectionPath, REPORT_EXPECTED_PROVIDER: 'gemini',
      REPORT_EXPECTED_NONCE: tuple.nonce, REPORT_EXPECTED_CONCLUSION: tuple.conclusion,
      REPORT_EXPECTED_DECISION_DIGEST: tuple.decisionDigest, GITHUB_REPOSITORY: tuple.repository,
      GITHUB_RUN_ID: tuple.runId, GITHUB_RUN_ATTEMPT: tuple.runAttempt, GITHUB_SHA: tuple.eventSha,
      GITHUB_WORKFLOW_SHA: tuple.callerWorkflowSha, GITHUB_WORKFLOW_REF: tuple.callerWorkflowRef,
      GATEKEEPER_WORKFLOW_REPOSITORY: tuple.workflowRepository, GATEKEEPER_WORKFLOW_SHA: tuple.workflowSha,
      GATEKEEPER_WORKFLOW_REF: tuple.workflowRef, BASE_SHA: tuple.baseSha, HEAD_SHA: tuple.headSha,
      REVIEWED_SHA: tuple.reviewedSha, RUNNER_TEMP: temp, POLICY_VERSION: '6', MODE: 'enforced',
      POLICY_RESULT: 'success', REVIEW_RESULT: 'success', PR_NUMBER: '77', GITHUB_TOKEN: 'fixture-token',
      GITHUB_STEP_SUMMARY: summaryPath, REPORT_PATH: hostReportPath, GITHUB_OUTPUT: outputPath, WORKFLOW_REF: tuple.workflowRef };
    const apiCalls = [];
    const fetchImpl = async (url, options = {}) => {
      const value = String(url); apiCalls.push({ url: value, options });
      if (value.endsWith('/pulls/77') && options.method !== 'POST') return Response.json({ head: { sha: tuple.headSha } });
      if (value.endsWith('/pulls/77/files?per_page=100&page=1')) return Response.json([
        { filename: 'src/example.mjs', status: 'added', additions: 1, deletions: 0, patch: '@@ -0,0 +8 @@\n+new line' },
      ]);
      if (value.endsWith('/pulls/77/comments?per_page=100&page=1')) return Response.json([]);
      if (value.endsWith('/pulls/77/reviews') && options.method === 'POST') return Response.json({}, { status: 200 });
      if (value.endsWith('/issues/77/comments?per_page=100&page=1')) return Response.json([]);
      if (value.endsWith('/issues/77/comments') && options.method === 'POST') {
        if (outcome === 'publish-failure') return new Response('failure', { status: 503 });
        return Response.json({}, { status: 201 });
      }
      throw new Error(`unexpected report API request ${value}`);
    };
    if (outcome === 'publish-failure') {
      await withProcessEnv(env, async () => assert.rejects(runCiReport(fetchImpl), /Required Architecture Gate report publication failed/));
      assert.equal(readFileSync(outputPath, 'utf8'), '', 'failed PR publication emits no successful report outputs');
      assert.match(readFileSync(summaryPath, 'utf8'), /Architecture Gate — BLOCK/);
      continue;
    }
    await withProcessEnv(env, () => runCiReport(fetchImpl));
    const body = readFileSync(summaryPath, 'utf8');
    const output = readFileSync(outputPath, 'utf8');
    assert.match(readFileSync(hostReportPath, 'utf8'), new RegExp(`Architecture Gate — ${protectedOutcome}`));
    if (outcome === 'host-sink-binding') {
      for (const path of [candidateReportPath, candidateSummaryPath, candidateProjectionPath, candidateOutputPath]) {
        assert.equal(readFileSync(path, 'utf8'), 'candidate must not choose this file');
      }
      assert.match(body, /Architecture Gate — PASS/);
      assert.match(output, /conclusion=PASS/);
    }
    assert.match(body, new RegExp(`Architecture Gate — ${protectedOutcome}`));
    assert.match(body, /candidate includes \*\*\*/);
    assert.match(body, /Authority mismatch/);
    assert.match(body, /Per-gate evaluation details/);
    assert.match(body, /Selected Authority Set/);
    assert.ok(body.includes('Decision SHA-256: `' + tuple.decisionDigest + '`'));
    assert.match(output, new RegExp(`conclusion=${protectedOutcome}`));
    assert.match(output, new RegExp(`decision_digest=${tuple.decisionDigest}`));
    const published = apiCalls.find(call => call.url.endsWith('/issues/77/comments') && call.options.method === 'POST');
    assert.ok(published, 'full report is published to the PR conversation');
    assert.match(JSON.parse(published.options.body).body, /Per-gate evaluation details/);
    const inline = apiCalls.find(call => call.url.endsWith('/pulls/77/reviews'));
    assert.equal(JSON.parse(inline.options.body).commit_id, tuple.headSha);
  }
});
