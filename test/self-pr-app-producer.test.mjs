import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beginProtectedSelfPrCheck, finishProtectedSelfPrCheck } from '../dist/self-pr-app-producer.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const repositoryId = 1379218762;
const baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40), subjectSha = 'c'.repeat(40);
const now = Date.parse('2026-10-22T00:00:00Z');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const app = { appId: 1234, installationId: 5678, repositoryId,
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
function response(url, payload, status = 200) {
  const result = new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}
function contextFixture({ changeFinal = false } = {}) {
  let count = 0;
  const fetchImpl = async url => {
    count++;
    const path = new URL(url).pathname.replace(`/repos/${repository}`, '');
    const final = changeFinal && count > 5;
    if (path === '/git/ref/heads/main') return response(url, { ref: 'refs/heads/main', object: { type: 'commit', sha: baseSha } });
    if (path === '/pulls/42') return response(url, { number: 42, state: 'open', draft: false, merge_commit_sha: subjectSha,
      base: { ref: 'main', sha: baseSha, repo: { full_name: repository, id: repositoryId } },
      head: { sha: final ? 'd'.repeat(40) : headSha, repo: { full_name: repository, id: repositoryId } } });
    if (path === '/commits/refs/pull/42/merge') return response(url, { sha: subjectSha, parents: [{ sha: baseSha }, { sha: headSha }] });
    throw new Error(`Unexpected URL ${path}`);
  };
  return { fetchImpl, get count() { return count; } };
}
function reporterFixture() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/access_tokens')) return response(url, { token: 'synthetic-token',
      expires_at: new Date(now + 60_000).toISOString(), permissions: { checks: 'write', metadata: 'read' },
      repositories: [{ id: repositoryId, full_name: repository }] }, 201);
    if (options.method === 'POST') return response(url, { id: 909, name: 'architecture-gate / accept', head_sha: subjectSha,
      status: 'in_progress', conclusion: null, app: { id: app.appId } }, 201);
    return response(url, { id: 909, name: 'architecture-gate / accept', head_sha: subjectSha,
      status: 'completed', conclusion: JSON.parse(options.body).conclusion, app: { id: app.appId } });
  };
  return { fetchImpl, calls };
}
function input(context = contextFixture(), reporter = reporterFixture()) {
  let appCalls = 0;
  const value = { context: { eventName: 'pull_request_target', event: { action: 'synchronize', repository: { full_name: repository, id: repositoryId },
    pull_request: { number: 42, state: 'open', draft: false,
      base: { ref: 'main', sha: baseSha, repo: { full_name: repository, id: repositoryId } },
      head: { sha: headSha, repo: { full_name: repository, id: repositoryId } } } },
    sourceBaseSha: baseSha, runtimeBaseSha: baseSha, token: 'read-token' }, contextFetchImpl: context.fetchImpl,
    getApp: async () => { appCalls++; return app; }, reportFetchImpl: reporter.fetchImpl, now };
  return { value, context, reporter, get appCalls() { return appCalls; } };
}
function validated(binding, overrides = {}) { return { status: 'VALIDATED_SELF_PR_RESULT', route: 'ordinary-pass', binding,
  oldSelectedAuthorityChanged: false, ...overrides }; }

test('begins and completes exact protected test-merge check after matching fresh protected context', async () => {
  const f = input();
  const begun = await beginProtectedSelfPrCheck(f.value);
  assert.equal(begun.status, 'BEGUN_SELF_PR_APP_CHECK');
  assert.equal(begun.check.headSha, subjectSha);
  const result = await finishProtectedSelfPrCheck({ ...f.value, begun,
    validateProtectedResult: async context => validated({ repository, repositoryId, prNumber: '42', baseSha: context.baseSha,
      headSha: context.headSha, subjectSha: context.subjectSha }) });
  assert.equal(result.status, 'REPORTED_SELF_PR_RESULT');
  assert.equal(result.route, 'ordinary-pass');
  assert.equal(result.check.conclusion, 'success');
  assert.equal(f.appCalls, 2);
  assert.equal(f.reporter.calls.filter(call => call.options.method === 'PATCH').length, 1);
});

test('finishes failure and does not report success for stale protected review binding', async () => {
  const f = input();
  const begun = await beginProtectedSelfPrCheck(f.value);
  const result = await finishProtectedSelfPrCheck({ ...f.value, begun,
    validateProtectedResult: async context => validated({ repository, repositoryId, prNumber: '42', baseSha: context.baseSha,
      headSha: context.headSha, subjectSha: 'd'.repeat(40) }) });
  assert.equal(result.status, 'FAILED_SELF_PR_RESULT');
  assert.equal(result.check.conclusion, 'failure');
  assert.equal(f.reporter.calls.filter(call => call.options.method === 'PATCH').length, 1);
});

test('reports an exact amendment eligibility route as queue eligibility only', async () => {
  const f = input();
  const begun = await beginProtectedSelfPrCheck(f.value);
  const result = await finishProtectedSelfPrCheck({ ...f.value, begun,
    validateProtectedResult: async context => validated({ repository, repositoryId, prNumber: '42', baseSha: context.baseSha,
      headSha: context.headSha, subjectSha: context.subjectSha }, { route: 'amendment-queue-eligible', oldSelectedAuthorityChanged: true }) });
  assert.equal(result.status, 'REPORTED_SELF_PR_RESULT');
  assert.equal(result.route, 'amendment-queue-eligible');
  assert.equal(result.check.conclusion, 'success');
  assert.equal(Object.hasOwn(result, 'adopted'), false);
});

test('does not complete success when prior selected authority changed flag is not false', async () => {
  const f = input();
  const begun = await beginProtectedSelfPrCheck(f.value);
  const result = await finishProtectedSelfPrCheck({ ...f.value, begun,
    validateProtectedResult: async context => validated({ repository, repositoryId, prNumber: '42', baseSha: context.baseSha,
      headSha: context.headSha, subjectSha: context.subjectSha }, { oldSelectedAuthorityChanged: true }) });
  assert.equal(result.status, 'FAILED_SELF_PR_RESULT');
  assert.equal(result.check.conclusion, 'failure');
});

test('final live PR mutation reports failure on the existing check', async () => {
  const f = input(contextFixture({ changeFinal: true }));
  const begun = await beginProtectedSelfPrCheck(f.value);
  const result = await finishProtectedSelfPrCheck({ ...f.value, begun,
    validateProtectedResult: async context => validated({ repository, repositoryId, prNumber: '42', baseSha: context.baseSha,
      headSha: context.headSha, subjectSha: context.subjectSha }) });
  assert.equal(result.status, 'FAILED_SELF_PR_RESULT');
  assert.equal(result.check.conclusion, 'failure');
});

function cliFixture(t, { includeReview = false, checkSha, workspaceMismatch = false } = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'self-pr-app-cli-')));
  const actualBase = execFileSync('git', ['-C', process.cwd(), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const callerBase = workspaceMismatch ? 'a'.repeat(40) : actualBase;
  const callerHead = 'e'.repeat(40), callerSubject = 'f'.repeat(40);
  checkSha ??= callerSubject;
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const eventDirectory = join(directory, '_github_workflow');
  mkdirSync(eventDirectory);
  const eventPath = join(eventDirectory, 'event.json'), outputPath = join(directory, 'output.txt');
  const markerPath = join(directory, 'patch.json');
  const tokenMarkerPath = join(directory, 'token-requested');
  const gitFetchMarkerPath = join(directory, 'git-fetch.jsonl');
  const gitBin = join(directory, 'bin');
  mkdirSync(gitBin);
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const gitWrapper = join(gitBin, 'git');
  writeFileSync(gitWrapper, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args=process.argv.slice(2);
if(args.includes('fetch')) { appendFileSync(process.env.TEST_GIT_FETCH_MARKER, JSON.stringify(args)+'\\n'); process.exit(0); }
if(args.includes('rev-parse')&&args.includes('--verify')&&args.at(-1)?.endsWith('^{commit}')) { process.stdout.write(args.at(-1).slice(0,-9)+'\\n'); process.exit(0); }
const result=spawnSync('${realGit}',args,{stdio:'inherit'}); process.exit(result.status ?? 1);
`);
  chmodSync(gitWrapper, 0o755);
  writeFileSync(outputPath, '');
  writeFileSync(eventPath, JSON.stringify({ action: 'synchronize', repository: { full_name: repository, id: repositoryId },
    pull_request: { number: 42, state: 'open', draft: false,
      base: { ref: 'main', sha: callerBase, repo: { full_name: repository, id: repositoryId } },
      head: { sha: callerHead, repo: { full_name: repository, id: repositoryId } } } }));
  const preload = join(directory, 'fetch-mock.mjs');
  writeFileSync(preload, `
    import { writeFileSync } from 'node:fs';
    const repo='${repository}', rid=${repositoryId}, base='${callerBase}', head='${callerHead}', subject='${callerSubject}', checkSha='${checkSha}';
    globalThis.fetch=async (input, init={})=>{
      const url=String(input); let status=200, payload;
      if(url.includes('/access_tokens')) { writeFileSync(process.env.TEST_TOKEN_MARKER,'requested'); status=201; payload={token:'synthetic',expires_at:new Date(Date.now()+60000).toISOString(),permissions:{checks:'write',metadata:'read'},repositories:[{id:rid,full_name:repo}]}; }
      else if(url.endsWith('/check-runs')&&init.method==='POST') { status=201; payload={id:909,name:'architecture-gate / accept',head_sha:checkSha,status:'in_progress',conclusion:null,app:{id:${app.appId}}}; }
      else if(url.endsWith('/check-runs/909')&&init.method==='PATCH') { const update=JSON.parse(init.body); payload={id:909,name:'architecture-gate / accept',head_sha:checkSha,status:'completed',conclusion:update.conclusion,app:{id:${app.appId}}}; writeFileSync(process.env.TEST_PATCH_MARKER,JSON.stringify(update)); }
      else if(url.endsWith('/git/ref/heads/main')) payload={ref:'refs/heads/main',object:{type:'commit',sha:base}};
      else if(url.endsWith('/pulls/42')) payload={number:42,state:'open',draft:false,merge_commit_sha:subject,base:{ref:'main',sha:base,repo:{full_name:repo,id:rid}},head:{sha:head,repo:{full_name:repo,id:rid}}};
      else if(url.endsWith('/commits/refs/pull/42/merge')) payload={sha:subject,parents:[{sha:base},{sha:head}]};
      else throw new Error('unexpected mocked API URL '+url);
      const response=new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});
      Object.defineProperty(response,'url',{value:url}); return response;
    };
  `);
  const env = { ...process.env, PATH: `${gitBin}:${process.env.PATH}`, TEST_GIT_FETCH_MARKER: gitFetchMarkerPath,
    NODE_OPTIONS: `--import=${preload}`, GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: String(repositoryId), GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_EVENT_PATH: eventPath,
    GITHUB_SHA: callerBase, GITHUB_WORKFLOW_SHA: callerBase, GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/self-architecture-gate.yml@refs/heads/main`,
    GATEKEEPER_WORKFLOW_REPOSITORY: repository, GATEKEEPER_WORKFLOW_SHA: callerBase,
    GATEKEEPER_WORKFLOW_REF: `${repository}/.github/workflows/self-architecture-gate.yml@refs/heads/main`,
    GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', BASE_SHA: callerBase, HEAD_SHA: callerHead, BASE_BRANCH: 'main',
    PR_NUMBER: '42', GH_TOKEN: 'read-token', RUNNER_TEMP: directory, GITHUB_OUTPUT: outputPath,
    AGK_APP_ID: String(app.appId), AGK_APP_INSTALLATION_ID: String(app.installationId),
    AGK_APP_PRIVATE_KEY: app.privateKeyPem, AGK_CHECK_ID: '909', AGK_CHECK_SHA: checkSha, TEST_PATCH_MARKER: markerPath,
    TEST_TOKEN_MARKER: tokenMarkerPath,
    GITHUB_WORKSPACE: process.cwd() };
  for (const key of ['AGK_REVIEW_WORKFLOW_REPOSITORY','AGK_REVIEW_WORKFLOW_SHA','AGK_REVIEW_WORKFLOW_REF','AGK_REVIEWED_SHA']) delete env[key];
  if (includeReview) Object.assign(env, { AGK_REVIEW_WORKFLOW_REPOSITORY: repository, AGK_REVIEW_WORKFLOW_SHA: callerBase,
    AGK_REVIEW_WORKFLOW_REF: `${repository}/.github/workflows/architecture-gate.yml@refs/heads/main`, AGK_REVIEWED_SHA: callerSubject });
  return { directory, outputPath, markerPath, tokenMarkerPath, gitFetchMarkerPath, env };
}

test('begin CLI accepts only protected caller tuple and does not require later review projection', t => {
  const fixture = cliFixture(t, { includeReview: false });
  execFileSync(process.execPath, [resolve('scripts/self-pr-app-report.mjs'), 'begin'], { cwd: fixture.directory, env: fixture.env, stdio: 'pipe' });
  const output = readFileSync(fixture.outputPath, 'utf8');
  assert.match(output, /check_id=909/);
  assert.match(output, new RegExp(`check_sha=${'f'.repeat(40)}`));
  assert.match(output, /pr_number=42/);
});

test('begin CLI rejects a checkout whose HEAD differs from protected base before requesting App credentials', t => {
  const fixture = cliFixture(t, { workspaceMismatch: true });
  assert.throws(() => execFileSync(process.execPath, [resolve('scripts/self-pr-app-report.mjs'), 'begin'],
    { cwd: fixture.directory, env: fixture.env, stdio: 'pipe' }));
  assert.equal(existsSync(fixture.tokenMarkerPath), false);
});

test('begin CLI rejects a runner event path outside the fixed temp event location before requesting App credentials', t => {
  const fixture = cliFixture(t);
  fixture.env.GITHUB_EVENT_PATH = join(fixture.directory, 'attacker-event.json');
  assert.throws(() => execFileSync(process.execPath, [resolve('scripts/self-pr-app-report.mjs'), 'begin'],
    { cwd: fixture.directory, env: fixture.env, stdio: 'pipe' }));
  assert.equal(existsSync(fixture.tokenMarkerPath), false);
});

test('report CLI fetches exact selected commits with protected token and finalizes failure when review projection is missing', t => {
  const fixture = cliFixture(t, { includeReview: false });
  assert.throws(() => execFileSync(process.execPath, [resolve('scripts/self-pr-app-report.mjs'), 'report'],
    { cwd: fixture.directory, env: fixture.env, stdio: 'pipe' }));
  assert.equal(JSON.parse(readFileSync(fixture.markerPath, 'utf8')).conclusion, 'failure');
  const fetches = readFileSync(fixture.gitFetchMarkerPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(fetches.length, 2);
  assert.ok(fetches.every(args => args.includes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') || args.includes('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') || args.includes('ffffffffffffffffffffffffffffffffffffffff')));
  assert.ok(fetches.some(args => args.at(-1) === 'ffffffffffffffffffffffffffffffffffffffff'));
  assert.ok(fetches.some(args => args.at(-1) === 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'));
});

test('report CLI finalizes failure when the begun check SHA does not match fresh selected context', t => {
  const fixture = cliFixture(t, { includeReview: true, checkSha: 'd'.repeat(40) });
  assert.throws(() => execFileSync(process.execPath, [resolve('scripts/self-pr-app-report.mjs'), 'report'],
    { cwd: fixture.directory, env: fixture.env, stdio: 'pipe' }));
  assert.equal(JSON.parse(readFileSync(fixture.markerPath, 'utf8')).conclusion, 'failure');
});
