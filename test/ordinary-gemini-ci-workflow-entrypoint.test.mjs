import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { runOrdinaryGeminiCiWorkflow } from '../dist/ordinary-gemini-ci-workflow.mjs';
import { parseOrdinaryGeminiPublicationLog } from '../dist/ordinary-gemini-ci-publication.mjs';

const authorityIds = ['architecture-contract', 'architecture-authority-set', 'architecture-owner-addition',
  'architecture-owner-amendment', 'architecture-review-execution', 'architecture-self-profile'];
const authorityPaths = authorityIds.map((_, index) => `docs/architecture/member-${index + 1}.md`);
const lockPath = '.codex/gatekeeper/gemini-verification-package-lock.json';
const schema = {
  type: 'object', required: ['decision', 'authorityIds'], additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
    authorityIds: { type: 'array', minItems: 6, items: { type: 'string' } },
    summary: { type: 'string' },
  },
};

function git(root, ...args) {
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim();
}

function put(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function commit(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function fixture(t, { cliMode = 'success', responseText } = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-adapter-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'checkout');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'feature/gemini-ordinary');
  const lockBytes = readFileSync(new URL('../.codex/gatekeeper/gemini-verification-package-lock.json', import.meta.url));
  const ids = authorityIds.map((id, index) => ({ id, repository: 'self', revision: 'authority-revision', path: authorityPaths[index] }));
  const policy = {
    version: 6,
    default: { mode: 'local-only' },
    branches: { 'feature/gemini-ordinary': {
      mode: 'enforced', provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
      authorityManifestPath: '.codex/gatekeeper/authorities.json',
      authorityLimits: { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 81_920,
        maxTotalBytes: 262_144, maxPromptBytes: 196_608 },
    } },
  };
  const files = {
    '.codex/gatekeeper/ci-policy.json': JSON.stringify(policy),
    '.codex/gatekeeper/ci-prompt.md': 'Protected base review instructions.\n',
    '.codex/gatekeeper/ci-decision.schema.json': JSON.stringify(schema),
    '.codex/gatekeeper/decision.validation.json': JSON.stringify({ version: 1, rules: [] }),
    '.codex/gatekeeper/authorities.json': JSON.stringify({ version: 1, authorities: ids }),
    [lockPath]: lockBytes,
    ...Object.fromEntries(authorityPaths.map((path, index) => [path, `Protected ${authorityIds[index]} authority.\n`])),
  };
  for (const [path, value] of Object.entries(files)) put(root, path, value);
  const baseSha = commit(root, 'protected ordinary Gemini base');
  git(root, 'switch', '-c', 'candidate');
  put(root, 'src/candidate.mjs', 'export const candidate = true;\n');
  const headSha = commit(root, 'candidate change');
  git(root, 'switch', 'feature/gemini-ordinary');
  git(root, 'merge', '--no-ff', '--no-edit', 'candidate');
  const reviewedSha = git(root, 'rev-parse', 'HEAD');

  const runtimeDirectory = join(parent, 'pinned-runtime');
  mkdirSync(runtimeDirectory, { mode: 0o700 });
  chmodSync(runtimeDirectory, 0o700);
  put(runtimeDirectory, 'package-lock.json', lockBytes);
  put(runtimeDirectory, 'node_modules/@google/gemini-cli/package.json', JSON.stringify({ name: '@google/gemini-cli', version: '0.62.0' }));
  const observationPath = join(parent, 'cli-observation.json');
  const response = responseText ?? JSON.stringify({ decision: 'PASS', authorityIds, summary: 'Synthetic adapter result.' });
  const invocationPath = join(parent, 'cli-invocations.txt');
  put(runtimeDirectory, 'node_modules/@google/gemini-cli/bundle/gemini.js', `
import { appendFileSync, writeFileSync } from 'node:fs';
if (process.argv.includes('--version')) { process.stdout.write('0.62.0'); process.exit(0); }
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
appendFileSync(${JSON.stringify(invocationPath)}, 'called\\n');
writeFileSync(${JSON.stringify(observationPath)}, JSON.stringify({ prompt, env: process.env }));
if (${JSON.stringify(cliMode)} === 'malformed') process.stdout.write('not-json');
else {
  process.stdout.write(JSON.stringify({ response: ${JSON.stringify(response)} }));
  if (${JSON.stringify(cliMode)} === 'nonzero') process.exit(7);
}
`);
  const runtimeEntry = join(runtimeDirectory, 'node_modules/@google/gemini-cli/bundle/gemini.js');
  const host = { root, repository: 'flair-agency/architecture-gatekeeper', baseBranch: 'feature/gemini-ordinary',
    baseSha, headSha, reviewedSha, runId: '12345', runAttempt: '1',
    workflowRef: 'flair-agency/architecture-gatekeeper/.github/workflows/ordinary-gemini.yml@refs/heads/main',
    policyPath: '.codex/gatekeeper/ci-policy.json', promptPath: '.codex/gatekeeper/ci-prompt.md',
    schemaPath: '.codex/gatekeeper/ci-decision.schema.json', validationPath: '.codex/gatekeeper/decision.validation.json' };
  const runtime = { directory: runtimeDirectory };
  return { parent, root, host, runtime, runtimeEntry, observationPath, invocationPath, baseSha, headSha, reviewedSha };
}

// Network acquisition and the installed provider CLI are synthetic. Git object
// verification, preparation, WIF exchange validation, CLI process supervision,
// decision validation and publication run through the production composition.
function workflowHarness(t, options = {}) {
  const f = fixture(t, options);
  const outputPath = join(f.parent, 'github-output');
  writeFileSync(outputPath, '');
  const environment = {
    GITHUB_REPOSITORY: f.host.repository, GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1',
    GATEKEEPER_WORKFLOW_SHA: f.baseSha, GATEKEEPER_WORKFLOW_REF: f.host.workflowRef,
    GATEKEEPER_WORKFLOW_REPOSITORY: f.host.repository, GITHUB_WORKFLOW_SHA: f.baseSha,
    GITHUB_WORKFLOW_REF: f.host.workflowRef, GITHUB_SHA: f.reviewedSha,
    BASE_SHA: f.baseSha, HEAD_SHA: f.headSha, REVIEWED_SHA: f.reviewedSha,
    PR_NUMBER: '42', BASE_BRANCH: f.host.baseBranch,
    CALLER_POLICY_PATH: f.host.policyPath, CALLER_PROMPT_PATH: f.host.promptPath,
    CALLER_SCHEMA_PATH: f.host.schemaPath, CALLER_VALIDATION_PATH: f.host.validationPath,
    GITHUB_WORKSPACE: f.root, RUNNER_TEMP: f.parent, GITHUB_OUTPUT: outputPath,
    GATEKEEPER_SOURCE_READ_TOKEN: 'fixture-source-token',
    GCP_WIF_PROVIDER: 'projects/123456789/locations/global/workloadIdentityPools/fixture-pool/providers/fixture-provider',
    GCP_WIF_SERVICE_ACCOUNT: 'fixture-reviewer@fixture-project.iam.gserviceaccount.com',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/fixture/idtoken?api-version=2.0',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-request-token',
  };
  const previous = { ...process.env };
  Object.assign(process.env, environment);
  for (const key of ['AGK_VERTEX_ACCESS_TOKEN', 'AGK_VERTEX_PROJECT', 'AGK_VERTEX_LOCATION']) delete process.env[key];
  const originalExec = childProcess.execFileSync;
  const originalSpawn = childProcess.spawnSync;
  const originalWrite = process.stdout.write;
  const originalFetch = globalThis.fetch;
  let log = '';
  const stages = [];
  process.stdout.write = function (chunk, ...args) {
    if (typeof chunk !== 'string' || !/^(?:::|AGK_ORDINARY_GEMINI_REPORT_V1 |Ordinary Gemini report projection)/.test(chunk)) return originalWrite.call(this, chunk, ...args);
    log += chunk; return true;
  };
  childProcess.execFileSync = (command, args, config) => {
    if (command === 'git' && args.includes('fetch')) {
      stages.push('git-fetch');
      assert.ok(log.includes('::add-mask::fixture-source-token\n'));
      assert.ok(log.includes(`::add-mask::${config.env.GIT_CONFIG_VALUE_0}\n`));
      assert.equal(args.at(-1), f.reviewedSha);
      return '';
    }
    if (command === 'git' && args.includes('ls-remote')) assert.fail('valid ordered tuple needs no fallback');
    return originalExec(command, args, config);
  };
  childProcess.spawnSync = (command, args, config) => {
    if (command !== 'npm') return originalSpawn(command, args, config);
    stages.push('npm');
    assert.deepEqual(args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.equal(config.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
    assert.equal(config.env.GATEKEEPER_SOURCE_READ_TOKEN, undefined);
    for (const path of ['package.json', 'bundle/gemini.js']) {
      put(config.cwd, `node_modules/@google/gemini-cli/${path}`,
        readFileSync(join(f.runtime.directory, 'node_modules/@google/gemini-cli', path)));
    }
    return { status: 0 };
  };
  syncBuiltinESMExports();
  let fetches = 0;
  globalThis.fetch = async (url, config) => {
    stages.push('wif');
    assert.deepEqual(stages.slice(0, 2), ['git-fetch', 'npm']);
    assert.equal(existsSync(f.invocationPath), false);
    assert.ok(log.includes('::add-mask::fixture-request-token\n'));
    fetches++;
    if (options.wifFailure) return new Response('PRIVATE-WIF-DETAIL', { status: 403 });
    const responses = [
      { value: 'fixture-oidc-assertion' },
      { access_token: 'fixture-sts-token', token_type: 'Bearer', issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', expires_in: 300 },
      { accessToken: 'fixture-vertex-token', expireTime: new Date(Date.now() + 300_000).toISOString() },
    ];
    assert.ok(fetches <= 3, 'WIF has no retry or fallback');
    if (fetches === 2) assert.ok(log.includes('::add-mask::fixture-oidc-assertion\n'));
    if (fetches === 3) assert.ok(log.includes('::add-mask::fixture-sts-token\n'));
    return new Response(JSON.stringify(responses[fetches - 1]), { status: 200 });
  };
  t.after(() => {
    childProcess.execFileSync = originalExec;
    childProcess.spawnSync = originalSpawn;
    syncBuiltinESMExports();
    process.stdout.write = originalWrite;
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  });
  return { ...f, outputPath, stages, log: () => log, fetches: () => fetches };
}

test('workflow composes ordered Git input, pinned installation, WIF, real CLI and bound publication offline', async t => {
  const f = workflowHarness(t);
  await runOrdinaryGeminiCiWorkflow();
  assert.equal(f.fetches(), 3);
  assert.equal(readFileSync(f.invocationPath, 'utf8').trim(), 'called');
  const output = Object.fromEntries(readFileSync(f.outputPath, 'utf8').trim().split('\n').map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
  }));
  assert.equal(output.decision_kind, 'PASS');
  assert.equal(output.reviewed_sha, f.reviewedSha);
  const projection = parseOrdinaryGeminiPublicationLog(f.log(), {
    repository: f.host.repository, runId: '12345', runAttempt: '1', eventSha: f.reviewedSha,
    callerWorkflowSha: f.baseSha, callerWorkflowRef: f.host.workflowRef,
    workflowRepository: f.host.repository, workflowSha: f.baseSha, workflowRef: f.host.workflowRef,
    baseSha: f.baseSha, headSha: f.headSha, reviewedSha: f.reviewedSha, provider: 'gemini',
    nonce: output.projection_nonce, conclusion: output.conclusion, decisionDigest: output.decision_digest,
  });
  assert.equal(projection.report.decision.decision, 'PASS');
  const observed = readFileSync(f.observationPath, 'utf8');
  for (const secret of ['fixture-source-token', 'fixture-request-token', 'fixture-oidc-assertion', 'fixture-sts-token', 'fixture-vertex-token']) {
    assert.equal(observed.includes(secret), false);
    assert.equal(JSON.stringify(projection).includes(secret), false);
  }
});

for (const options of [{ wifFailure: true }, { cliMode: 'malformed' }, { cliMode: 'nonzero' }]) {
  test(`workflow leaves no semantic output after ${JSON.stringify(options)}`, async t => {
    const f = workflowHarness(t, options);
    await assert.rejects(runOrdinaryGeminiCiWorkflow());
    assert.equal(readFileSync(f.outputPath, 'utf8'), '');
    assert.equal(f.log().includes('AGK_ORDINARY_GEMINI_REPORT_V1 '), false);
    assert.equal(f.log().includes('PRIVATE-WIF-DETAIL'), false);
    assert.equal(f.fetches(), options.wifFailure ? 1 : 3);
    if (options.wifFailure) assert.equal(existsSync(f.invocationPath), false);
    else assert.equal(readFileSync(f.invocationPath, 'utf8').trim(), 'called');
  });
}

test('workflow rejects reversed event parents before runtime installation or WIF', async t => {
  const f = workflowHarness(t);
  process.env.BASE_SHA = f.headSha;
  process.env.HEAD_SHA = f.baseSha;
  await assert.rejects(runOrdinaryGeminiCiWorkflow());
  assert.deepEqual(f.stages, ['git-fetch']);
  assert.equal(f.fetches(), 0);
  assert.equal(readFileSync(f.outputPath, 'utf8'), '');
  assert.equal(f.log().includes('AGK_ORDINARY_GEMINI_REPORT_V1 '), false);
});

test('workflow completes protected preparation before requesting WIF credentials', async t => {
  const f = workflowHarness(t);
  process.env.CALLER_POLICY_PATH = '.codex/gatekeeper/absent-policy.json';
  await assert.rejects(runOrdinaryGeminiCiWorkflow());
  assert.deepEqual(f.stages, ['git-fetch', 'npm']);
  assert.equal(f.fetches(), 0);
  assert.equal(existsSync(f.invocationPath), false);
  assert.equal(readFileSync(f.outputPath, 'utf8'), '');
  assert.equal(f.log().includes('AGK_ORDINARY_GEMINI_REPORT_V1 '), false);
});

test('direct workflow CLI sanitizes invalid environment and emits no semantic result', () => {
  const result = childProcess.spawnSync(process.execPath, [new URL('../dist/ordinary-gemini-ci-workflow.mjs', import.meta.url).pathname], {
    encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'PRIVATE-INVALID-REPOSITORY' }, timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Protected ordinary Gemini CI did not complete; review remains incomplete.\n');
});
