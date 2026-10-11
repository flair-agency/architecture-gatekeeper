import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCiPolicy } from '../dist/resolve-ci-policy.mjs';
import { prepareSelectedReviewReferences, prepareSelectedReviewReferencesFromBase, runPrepareSelectedReviewReferencesCli } from '../dist/prepare-selected-review-references.mjs';
import { namedStep, readWorkflow } from './helpers/workflow-structure.mjs';

const limits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 81920,
  maxTotalBytes: 262144, maxPromptBytes: 524288 };
const limitsBase64 = Buffer.from(JSON.stringify(limits)).toString('base64');
const gitlinks = [
  { path: 'vendor/alpha', repository: 'public/alpha', revision: 'a'.repeat(40) },
  { path: 'vendor/beta', repository: 'public/beta', revision: 'b'.repeat(40) },
];
const first = Buffer.from('# Alpha Skill\nAlpha contract text.\n');
const second = Buffer.from('# Beta Skill\nBeta contract text.\n');
const manifest = (references = ['vendor/alpha/SKILL.md', 'vendor/beta/SKILL.md'], overrides = {}) => Buffer.from(JSON.stringify({
  version: 1, maxReferenceBytes: 1024, maxTotalBytes: 2048, references, ...overrides,
}));
const readSnapshot = async ({ repository, revision, path }) => ({ repository, resolvedCommit: revision, path, type: 'file',
  content: repository === 'public/alpha' ? first : second });
const git = (root, ...args) => execFileSync('git', ['--no-replace-objects', '-C', root, ...args], { encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim();

function makeBaseHeadGitlinkFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'selected-reference-base-binding-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  mkdirSync(join(root, '.codex/gatekeeper'), { recursive: true });
  writeFileSync(join(root, '.codex/gatekeeper/references.json'), manifest());
  writeFileSync(join(root, 'alpha.txt'), 'alpha base seed\n');
  git(root, 'add', 'alpha.txt'); git(root, 'commit', '-qm', 'alpha seed');
  const alphaBase = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'beta.txt'), 'beta base seed\n');
  git(root, 'add', 'beta.txt'); git(root, 'commit', '-qm', 'beta seed');
  const betaBase = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, '.gitmodules'), '[submodule "alpha"]\n\tpath = vendor/alpha\n\turl = https://github.com/public/alpha.git\n[submodule "beta"]\n\tpath = vendor/beta\n\turl = https://github.com/public/beta.git\n');
  git(root, 'add', '-f', '.gitmodules', '.codex/gatekeeper/references.json');
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${alphaBase},vendor/alpha`);
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${betaBase},vendor/beta`);
  git(root, 'commit', '-qm', 'protected base selection');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'alpha.txt'), 'alpha candidate seed\n');
  git(root, 'add', 'alpha.txt'); git(root, 'commit', '-qm', 'alpha candidate');
  const alphaHead = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'beta.txt'), 'beta candidate seed\n');
  git(root, 'add', 'beta.txt'); git(root, 'commit', '-qm', 'beta candidate');
  const betaHead = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, '.gitmodules'), '[submodule "alpha"]\n\tpath = vendor/alpha\n\turl = https://github.com/candidate/alpha\n[submodule "beta"]\n\tpath = vendor/beta\n\turl = https://github.com/candidate/beta\n');
  git(root, 'add', '-f', '.gitmodules');
  git(root, 'update-index', '--cacheinfo', `160000,${alphaHead},vendor/alpha`);
  git(root, 'update-index', '--cacheinfo', `160000,${betaHead},vendor/beta`);
  git(root, 'commit', '-qm', 'candidate changes reference identities and pins');
  const headSha = git(root, 'rev-parse', 'HEAD');
  assert.notEqual(baseSha, headSha);
  return { root, baseSha, headSha, alphaBase, betaBase };
}

test('v4 alone may select an optional supplemental-reference manifest path and resolver CLI emits it', t => {
  const branch = { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
    ownerAddition: { version: 2, authorityId: 'architecture', grade: 'G0', authorityPath: 'docs/architecture.md',
      promptPath: '.codex/gatekeeper/owner-prompt.md', schemaPath: '.codex/gatekeeper/owner-schema.json' },
    reviewReferenceManifestPath: '.codex/gatekeeper/review-references.json' };
  const resolved = resolveCiPolicy({ version: 4, default: { mode: 'local-only' }, branches: { main: branch } }, 'main');
  assert.equal(resolved.reviewReferenceManifestPath, '.codex/gatekeeper/review-references.json');
  const noReferences = { ...branch }; delete noReferences.reviewReferenceManifestPath;
  assert.equal(Object.hasOwn(resolveCiPolicy({ version: 4, default: { mode: 'local-only' }, branches: { main: noReferences } }, 'main'), 'reviewReferenceManifestPath'), false);
  for (const path of ['../refs.json', '/refs.json', 'refs.yml', 'refs/../refs.json']) {
    assert.throws(() => resolveCiPolicy({ version: 4, default: { mode: 'local-only' }, branches: { main: { ...branch, reviewReferenceManifestPath: path } } }, 'main'));
  }
  assert.throws(() => resolveCiPolicy({ version: 2, default: { mode: 'local-only' }, branches: { main: { ...branch, reviewReferenceManifestPath: '.codex/refs.json' } } }, 'main'));
  const directory = mkdtempSync(join(tmpdir(), 'selected-reference-policy-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const selectedPath = join(directory, 'selected.json');
  writeFileSync(selectedPath, JSON.stringify({ version: 4, default: { mode: 'local-only' }, branches: { main: branch } }));
  const cli = fileURLToPath(new URL('../dist/resolve-ci-policy.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [cli, selectedPath, 'main'], { encoding: 'utf8' });
  assert.match(output, /^reviewReferenceManifestPath=\.codex\/gatekeeper\/review-references\.json$/m);
  writeFileSync(selectedPath, JSON.stringify({ version: 4, default: { mode: 'local-only' }, branches: { main: noReferences } }));
  assert.doesNotMatch(execFileSync(process.execPath, [cli, selectedPath, 'main'], { encoding: 'utf8' }), /reviewReferenceManifestPath=/);
});

test('two exact public snapshots produce bounded supplemental prompt context with identities and digests', async () => {
  const result = await prepareSelectedReviewReferences({ manifestBytes: manifest(), authorityLimitsBase64: limitsBase64,
    parentBaseSha: 'c'.repeat(40), gitlinks, readSnapshot });
  for (const body of ['Alpha contract text.', 'Beta contract text.']) assert.ok(result.promptContext.includes(body));
  assert.match(result.promptContext, /parent base c{40}/);
  assert.match(result.promptContext, /Gitlink vendor\/alpha \(a{40}\)/);
  assert.match(result.promptContext, new RegExp(createHash('sha256').update(first).digest('hex')));
  assert.match(result.promptContext, new RegExp(createHash('sha256').update(second).digest('hex')));
  assert.equal(result.references.length, 2);
  assert.doesNotMatch(JSON.stringify(result.references), /contract text/);
});

test('base adapter reads only protected-base manifest, .gitmodules and Gitlink pins when candidate changes them', async t => {
  const { root, baseSha, headSha, alphaBase, betaBase } = makeBaseHeadGitlinkFixture(t);
  const requests = [];
  const bodyA = Buffer.from('protected alpha Skill\n');
  const bodyB = Buffer.from('protected beta Skill\n');
  const resolved = await prepareSelectedReviewReferencesFromBase({ root, baseSha,
    manifestPath: '.codex/gatekeeper/references.json', authorityLimitsBase64: limitsBase64,
    readSnapshot: async request => {
      requests.push(request);
      const content = request.repository === 'public/alpha' ? bodyA : bodyB;
      return { ...request, resolvedCommit: request.revision, type: 'file', content };
    } });
  assert.deepEqual(requests.map(({ repository, revision }) => ({ repository, revision })), [
    { repository: 'public/alpha', revision: alphaBase }, { repository: 'public/beta', revision: betaBase },
  ]);
  assert.ok(resolved.promptContext.includes('protected alpha Skill'));
  assert.ok(resolved.promptContext.includes('protected beta Skill'));
  assert.ok(!resolved.promptContext.includes('candidate/alpha'));
});

test('base adapter rejects a symlinked policy manifest blob', async t => {
  const { root, baseSha } = makeBaseHeadGitlinkFixture(t);
  const runner = async base => prepareSelectedReviewReferencesFromBase({ root, baseSha: base,
    manifestPath: '.codex/gatekeeper/references.json', authorityLimitsBase64: limitsBase64, readSnapshot });
  const oid = execFileSync('git', ['--no-replace-objects', '-C', root, 'hash-object', '-w', '--stdin'],
    { input: 'references-copy.json', encoding: 'utf8' }).trim();
  git(root, 'update-index', '--cacheinfo', `120000,${oid},.codex/gatekeeper/references.json`);
  git(root, 'commit', '-qm', 'symlink reference manifest');
  await assert.rejects(runner(git(root, 'rev-parse', 'HEAD')), /regular Git blob/);
});

test('production CLI emits bounded snapshots from base Gitlinks with anonymous public API reads', async t => {
  const { root, baseSha, alphaBase, betaBase } = makeBaseHeadGitlinkFixture(t);
  const runnerTemp = mkdtempSync(join(tmpdir(), 'selected-reference-cli-output-'));
  t.after(() => rmSync(runnerTemp, { recursive: true, force: true }));
  const alphaTree = '1'.repeat(40), betaTree = '2'.repeat(40);
  const alphaBody = Buffer.from('CLI alpha base Skill\n'), betaBody = Buffer.from('CLI beta base Skill\n');
  const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const responseData = new Map();
  for (const [repo, commit, tree, body] of [
    ['public/alpha', alphaBase, alphaTree, alphaBody], ['public/beta', betaBase, betaTree, betaBody],
  ]) {
    const apiRoot = `https://api.github.com/repos/${repo}`;
    const blob = blobHash(body);
    responseData.set(apiRoot, { full_name: repo, private: false });
    responseData.set(`${apiRoot}/git/commits/${commit}`, { sha: commit, tree: { sha: tree } });
    responseData.set(`${apiRoot}/git/trees/${tree}`, { sha: tree, truncated: false, tree: [
      { path: 'SKILL.md', mode: '100644', type: 'blob', sha: blob, size: body.length },
    ] });
    responseData.set(`${apiRoot}/git/blobs/${blob}`, { sha: blob, size: body.length, encoding: 'base64', content: body.toString('base64') });
  }
  const previousFetch = globalThis.fetch;
  const previousExitCode = process.exitCode;
  const envNames = ['GITHUB_WORKSPACE', 'BASE_SHA', 'REVIEW_REFERENCE_MANIFEST_PATH', 'AUTHORITY_LIMITS_BASE64', 'RUNNER_TEMP'];
  const previousEnv = new Map(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, { GITHUB_WORKSPACE: root, BASE_SHA: baseSha,
    REVIEW_REFERENCE_MANIFEST_PATH: '.codex/gatekeeper/references.json', AUTHORITY_LIMITS_BASE64: limitsBase64,
    RUNNER_TEMP: runnerTemp });
  globalThis.fetch = async (url, options) => {
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
    const value = responseData.get(String(url));
    return value ? Response.json(value) : Response.json({ message: 'missing fixture' }, { status: 404 });
  };
  try { await runPrepareSelectedReviewReferencesCli(); }
  finally {
    globalThis.fetch = previousFetch;
    process.exitCode = previousExitCode;
    for (const [name, value] of previousEnv) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
  const outputPath = join(runnerTemp, 'architecture-gate-selected-references.md');
  const promptContext = readFileSync(outputPath, 'utf8');
  assert.match(promptContext, /CLI alpha base Skill/);
  assert.match(promptContext, /CLI beta base Skill/);
  assert.match(promptContext, new RegExp(`parent base ${baseSha}`));
  assert.equal(statSync(outputPath).mode & 0o777, 0o600);
});

test('fails closed for malformed selection, identity mismatch, binary source, and aggregate overflow', async () => {
  const prepare = (bytes, reader = readSnapshot) => prepareSelectedReviewReferences({ manifestBytes: bytes,
    authorityLimitsBase64: limitsBase64, parentBaseSha: 'c'.repeat(40), gitlinks, readSnapshot: reader });
  await assert.rejects(prepare(manifest(['vendor/alpha/SKILL.md', '../SKILL.md'])), /Gitlink/);
  await assert.rejects(prepare(manifest(['vendor/alpha/SKILL.md', 'vendor/alpha/SKILL.md'])), /duplicate/);
  await assert.rejects(prepare(manifest(['vendor/alpha/SKILL.md', 'vendor/beta/SKILL.md', 'vendor/gamma/SKILL.md'])), /one or two/);
  await assert.rejects(prepare(manifest(), async request => ({ ...await readSnapshot(request), resolvedCommit: 'd'.repeat(40) })), /identity/);
  await assert.rejects(prepare(manifest(), async request => ({ ...await readSnapshot(request), content: Buffer.from([0x61, 0x00, 0xff]) })), /UTF-8|binary/);
  await assert.rejects(prepare(manifest(['vendor/alpha/SKILL.md', 'vendor/beta/SKILL.md'], { maxTotalBytes: 45 })), /aggregate/);
  await assert.rejects(prepare(Buffer.from('{"version":1,"version":1}')), /UTF-8 JSON/);
});

test('ordinary workflow hands the selected-reference packet to its existing prompt preparation and Codex Action', () => {
  const workflow = readWorkflow('../../.github/workflows/architecture-gate-consumer.yml').workflow;
  const policyOutput = workflow.jobs.policy.outputs.review_reference_manifest_path;
  assert.equal(policyOutput, '${{ steps.resolve.outputs.reviewReferenceManifestPath }}');
  const validation = namedStep(workflow.jobs.review, 'Verify supplemental reference selection matches protected-base policy');
  assert.match(validation.if, /review_reference_manifest_path.*inputs\.review-reference-manifest-path/);
  for (const [selected, caller, expected] of [
    ['.codex/gatekeeper/references.json', '.codex/gatekeeper/references.json', 0],
    ['.codex/gatekeeper/references.json', '', 1],
    ['.codex/gatekeeper/references.json', '.codex/other.json', 1],
    ['', '.codex/gatekeeper/references.json', 1],
  ]) {
    const result = spawnSync('bash', ['-e', '-c', validation.run], { env: { ...process.env,
      POLICY_REFERENCE_MANIFEST_PATH: selected, CALLER_REFERENCE_MANIFEST_PATH: caller } });
    assert.equal(result.status, expected);
  }
  const authority = namedStep(workflow.jobs.review, 'Materialize protected Authority Set before review');
  assert.match(authority.run, /architecture-gate-selected-references\.md/);
  assert.match(authority.run, /architecture-gate-complete-prompt\.md/);
  const context = namedStep(workflow.jobs.review, 'Attach exact pull request task context to protected review');
  assert.match(context.env.AUTHORITY_ROUTE_SELECTED, /authority_manifest_path/);
  const action = namedStep(workflow.jobs.review, 'Run read-only architecture review');
  assert.match(action.with['prompt-file'], /architecture-gate-review-prompt\.md/);
});
