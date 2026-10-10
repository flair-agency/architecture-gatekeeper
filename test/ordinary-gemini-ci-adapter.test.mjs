import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { prepareOrdinaryGeminiCiAdapter, executeOrdinaryGeminiCiAdapter } from '../dist/ordinary-gemini-ci-adapter.mjs';
import { runOrdinaryGeminiCiLauncher } from '../dist/ordinary-gemini-ci-launcher.mjs';

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

test('prepares fixed protected inputs from the observed ordered merge before Vertex credentials', async t => {
  const f = fixture(t);
  const preparation = await prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null });
  assert.equal(preparation.context.reviewedSha, f.reviewedSha);
  assert.deepEqual(preparation.context.orderedParents, [f.baseSha, f.headSha]);
  assert.equal(preparation.runtime.entry, f.runtimeEntry);
  assert.equal(preparation.runtime.version, '0.62.0');
  assert.equal(Object.hasOwn(preparation, 'prepared'), false, 'prepared authority material remains private in memory');
  assert.equal(Object.hasOwn(process.env, 'AGK_VERTEX_ACCESS_TOKEN'), false);
});

test('executes one profile call and returns validated decision and bindings without publishing output', async t => {
  const f = fixture(t);
  const preparation = await prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null });
  const credential = { token: 'fixture-parent-token-never-forwarded', project: 'fixture-project', region: 'global' };
  const result = await executeOrdinaryGeminiCiAdapter({ preparation, credential });
  assert.equal(result.execution.status, 'completed');
  assert.ok(Buffer.isBuffer(result.execution.responseBytes));
  assert.deepEqual(result.execution.responseBytes, Buffer.from(JSON.stringify({ decision: 'PASS', authorityIds,
    summary: 'Synthetic adapter result.' })));
  assert.deepEqual(result.decision, { decision: 'PASS', authorityIds, summary: 'Synthetic adapter result.' });
  assert.equal(result.bindings.repository, f.host.repository);
  assert.equal(result.bindings.baseSha, f.baseSha);
  assert.equal(result.bindings.headSha, f.headSha);
  assert.equal(result.bindings.reviewedMergeSha, f.reviewedSha);
  assert.equal(result.dispatchDiagnostics.maximum, 10);
  const observed = JSON.parse(readFileSync(f.observationPath, 'utf8'));
  assert.match(observed.prompt, /Protected architecture-contract authority/);
  assert.equal(JSON.stringify(observed.env).includes(credential.token), false);
  assert.equal(JSON.stringify(result).includes(credential.token), false);
  assert.equal(Object.hasOwn(result, 'final_message'), false);
});

test('rejects mismatched host parents and accessor/proxy control records before field reads', async t => {
  const f = fixture(t);
  let getterReads = 0;
  const accessorInput = { host: f.host, runtime: f.runtime, sourceToken: null };
  Object.defineProperty(accessorInput, 'sourceToken', { enumerable: true, get() { getterReads += 1; return null; } });
  await assert.rejects(prepareOrdinaryGeminiCiAdapter(accessorInput), /plain data record|unsupported or missing/);
  assert.equal(getterReads, 0);
  await assert.rejects(prepareOrdinaryGeminiCiAdapter(new Proxy({}, { get() { getterReads += 1; } })), /plain data record/);
  assert.equal(getterReads, 0);
  const accessorHost = { ...f.host };
  Object.defineProperty(accessorHost, 'headSha', { enumerable: true, get() { getterReads += 1; return f.headSha; } });
  await assert.rejects(prepareOrdinaryGeminiCiAdapter({ host: accessorHost, runtime: f.runtime, sourceToken: null }), /plain data record|unsupported or missing/);
  const accessorRuntime = {};
  Object.defineProperty(accessorRuntime, 'directory', { enumerable: true, get() { getterReads += 1; return f.runtime.directory; } });
  await assert.rejects(prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: accessorRuntime, sourceToken: null }), /plain data record|unsupported or missing/);
  assert.equal(getterReads, 0);
  await assert.rejects(prepareOrdinaryGeminiCiAdapter({ host: { ...f.host, baseSha: f.headSha, headSha: f.baseSha },
    runtime: f.runtime, sourceToken: null }), /does not match the host base, head, and ordered merge parents/);
  assert.equal(existsSync(f.observationPath), false, 'invalid host context must not start the CLI');
});

test('refuses preparation after Vertex credential issuance has populated the parent environment', async t => {
  const f = fixture(t);
  const previous = process.env.AGK_VERTEX_ACCESS_TOKEN;
  process.env.AGK_VERTEX_ACCESS_TOKEN = 'fixture-token';
  try {
    await assert.rejects(prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null }),
      /must finish before Vertex credentials are present/);
  } finally {
    if (previous === undefined) delete process.env.AGK_VERTEX_ACCESS_TOKEN;
    else process.env.AGK_VERTEX_ACCESS_TOKEN = previous;
  }
});

test('rejects credential accessors before credential property evaluation', async t => {
  const f = fixture(t);
  const preparation = await prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null });
  let getterReads = 0;
  const credential = { project: 'fixture-project', region: 'global' };
  Object.defineProperty(credential, 'token', { enumerable: true, get() { getterReads += 1; return 'fixture-token'; } });
  await assert.rejects(executeOrdinaryGeminiCiAdapter({ preparation, credential }), /plain data record|unsupported or missing/);
  assert.equal(getterReads, 0);
});

test('rechecks inspected runtime identity immediately before profile execution', async t => {
  const f = fixture(t);
  const preparation = await prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null });
  put(f.runtime.directory, 'node_modules/@google/gemini-cli/bundle/gemini.js', 'changed after preparation\n');
  await assert.rejects(executeOrdinaryGeminiCiAdapter({ preparation,
    credential: { token: 'fixture-parent-token', project: 'fixture-project', region: 'global' } }), /runtime changed after preparation/);
});

test('rejects absent and invalid CLI outcomes without retry or fallback', async t => {
  const incomplete = fixture(t, { responseText: '' });
  const preparedIncomplete = await prepareOrdinaryGeminiCiAdapter({ host: incomplete.host, runtime: incomplete.runtime, sourceToken: null });
  await assert.rejects(executeOrdinaryGeminiCiAdapter({ preparation: preparedIncomplete,
    credential: { token: 'fixture-parent-token', project: 'fixture-project', region: 'global' } }),
    /invalid or error response envelope/);
  assert.equal(readFileSync(incomplete.invocationPath, 'utf8').trim().split('\n').length, 1);

  for (const cliMode of ['nonzero', 'malformed']) {
    const failed = fixture(t, { cliMode });
    const preparation = await prepareOrdinaryGeminiCiAdapter({ host: failed.host, runtime: failed.runtime, sourceToken: null });
    await assert.rejects(executeOrdinaryGeminiCiAdapter({ preparation,
      credential: { token: 'fixture-parent-token', project: 'fixture-project', region: 'global' } }));
    assert.equal(readFileSync(failed.invocationPath, 'utf8').trim().split('\n').length, 1, `${cliMode} must not retry`);
  }
});

const syntheticWif = Object.freeze({
  workloadIdentityProvider: 'projects/123456789/locations/global/workloadIdentityPools/fixture-pool/providers/fixture-provider',
  serviceAccount: 'fixture-reviewer@fixture-project.iam.gserviceaccount.com',
  project: 'fixture-project', region: 'global',
  oidcRequestUrl: 'https://pipelines.actions.githubusercontent.com/fixture/idtoken?api-version=2.0',
  oidcRequestToken: 'fixture-github-request-capability',
});

test('parent launcher prepares before WIF issuance and completes one synthetic session without credential inheritance', async t => {
  const f = fixture(t);
  const calls = [];
  const issuerFetch = async (url, options) => {
    assert.equal(existsSync(f.invocationPath), false, 'no CLI session before WIF completion');
    calls.push({ url: String(url), options });
    const response = calls.length === 1 ? { value: 'fixture-github-oidc-assertion' }
      : calls.length === 2 ? { access_token: 'fixture-sts-federated-token', token_type: 'Bearer',
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', expires_in: 300 }
        : { accessToken: 'fixture-parent-only-vertex-token', expireTime: new Date(Date.now() + 300_000).toISOString() };
    return new Response(JSON.stringify(response), { status: 200 });
  };
  const registered = [];
  const result = await runOrdinaryGeminiCiLauncher({ host: f.host, runtime: f.runtime,
    sourceToken: null, wif: syntheticWif }, issuerFetch, secret => {
      assert.equal(existsSync(f.invocationPath), false, 'credentials masked before CLI session');
      registered.push(secret);
    });
  assert.deepEqual(registered, ['fixture-github-request-capability', 'fixture-github-oidc-assertion',
    'fixture-sts-federated-token', 'fixture-parent-only-vertex-token']);
  assert.equal(calls.length, 3);
  assert.equal(result.decision.decision, 'PASS');
  assert.equal(result.bindings.reviewedMergeSha, f.reviewedSha);
  assert.equal(readFileSync(f.invocationPath, 'utf8').trim(), 'called');
  const observed = JSON.parse(readFileSync(f.observationPath, 'utf8'));
  for (const secret of ['fixture-github-request-capability', 'fixture-github-oidc-assertion',
    'fixture-sts-federated-token', 'fixture-parent-only-vertex-token']) {
    assert.equal(JSON.stringify(observed).includes(secret), false);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('parent launcher stops before issuance on preparation failure and before CLI on WIF failure', async t => {
  const f = fixture(t);
  let calls = 0;
  const rejectedFetch = async () => { calls += 1; return new Response('private upstream detail', { status: 403 }); };
  await assert.rejects(runOrdinaryGeminiCiLauncher({ host: { ...f.host, baseSha: f.headSha, headSha: f.baseSha },
    runtime: f.runtime, sourceToken: null, wif: syntheticWif }, rejectedFetch), /ordered merge parents/);
  assert.equal(calls, 0);
  await assert.rejects(runOrdinaryGeminiCiLauncher({ host: f.host, runtime: f.runtime,
    sourceToken: null, wif: syntheticWif }, rejectedFetch));
  assert.equal(calls, 1, 'WIF error has no retry or fallback');
  assert.equal(existsSync(f.invocationPath), false);
});


test('base checkout validates the same exact candidate review without materializing candidate code', async t => {
  const f = fixture(t);
  const credential = { token: 'fixture-parent-token', project: 'fixture-project', region: 'global' };
  const mergePrepared = await prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null });
  const mergeResult = await executeOrdinaryGeminiCiAdapter({ preparation: mergePrepared, credential });
  git(f.root, 'checkout', '--detach', f.baseSha);
  assert.equal(existsSync(join(f.root, 'src/candidate.mjs')), false);
  const basePrepared = await prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null });
  const baseResult = await executeOrdinaryGeminiCiAdapter({ preparation: basePrepared, credential });
  assert.deepEqual(baseResult.bindings, mergeResult.bindings);
  assert.deepEqual(baseResult.authorityProvenance, mergeResult.authorityProvenance);
  assert.deepEqual(baseResult.decision, mergeResult.decision);
  git(f.root, 'checkout', '--detach', f.headSha);
  await assert.rejects(prepareOrdinaryGeminiCiAdapter({ host: f.host, runtime: f.runtime, sourceToken: null }), /does not match the host base, head, and ordered merge parents/);
});
