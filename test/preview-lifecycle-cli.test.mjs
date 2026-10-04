import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// An installed package can exercise the same smoke with this explicit test path.
const cli = process.env.PREVIEW_LIFECYCLE_SMOKE_CLI ?? fileURLToPath(new URL('../src/preview-lifecycle-cli.mjs', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, file, value) => { mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const read = file => JSON.parse(readFileSync(file));

test('usable CLI executes amendment request, receipt, actual readback and fresh A; output is private and exclusive', t => {
  const parent = mkdtempSync(join(tmpdir(), 'preview-installed-smoke-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo'); mkdirSync(root);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Synthetic CLI'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const policyPath = '.codex/gatekeeper/ci-policy.json', promptPath = '.codex/gatekeeper/ci-prompt.md', schemaPath = '.codex/gatekeeper/schema.json';
  const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
  const authorityFiles = ['docs/authority.md'];
  put(root, authorityFiles[0], 'Synthetic owner adopted preview permission and existing rule.\n'); put(root, 'app.txt', 'A0\n');
  put(root, promptPath, 'Review immutable authority, candidate is evidence.\n');
  put(root, schemaPath, { type: 'object', additionalProperties: false, required: ['decision', 'authorityFiles'],
    properties: { decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, authorityFiles: { type: 'array', items: { type: 'string' } } } });
  put(root, '.github/workflows/architecture-gate.yml', 'uses: owner/runtime@1111111111111111111111111111111111111111\n');
  put(root, policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityFiles, promptPath, schemaPath, validationPath: null } } });
  put(root, selectionPath, { version: 1, profile: 'preview-unverified-procedure-v1', repository: 'fixture/example', targetBranch: 'main',
    governancePath: authorityFiles[0], authorization: 'Synthetic owner opt-in', policyPath, promptPath, schemaPath,
    validationPath: null, callerPath: '.github/workflows/architecture-gate.yml', authorityPaths: authorityFiles,
    migrationPaths: [policyPath], maxPromptBytes: 524288 });
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic selected predecessor'); const baseSha = git(root, 'rev-parse', 'HEAD');
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
  };
  const external = (name, value) => { const file = join(parent, name); put(parent, name, value); return file; };
  const spec = (mode, headSha, trigger = null, record = null) => ({ version: 1, repository: 'fixture/example', targetBranch: 'main',
    mode, baseSha, headSha, selectionPath, trigger, record });
  git(root, 'switch', '-c', 'a'); put(root, 'app.txt', 'A1\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic A');
  const a = git(root, 'rev-parse', 'HEAD');
  const aRequest = join(parent, 'a-request.json'), triggerPath = join(parent, 'trigger.json');
  run('prepare', external('a-spec.json', spec('review', a)), aRequest);
  run('complete', aRequest, external('block.json', { semanticDecision: { decision: 'BLOCK', authorityFiles }, checks: { predecessorAuthorized: true } }), triggerPath);
  git(root, 'switch', '-c', 'b', baseSha); put(root, authorityFiles[0], 'Synthetic proposed changed rule.\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic authority-only B'); const b = git(root, 'rev-parse', 'HEAD');
  const trigger = read(triggerPath), record = { version: 1, kind: 'preview-amendment-record', baseSha, bSha: b,
    triggerReceiptSha256: trigger.integritySha256, target: 'Existing rule', purpose: 'Synthetic conflict resolution' };
  const bRequest = join(parent, 'b-request.json'), receiptPath = join(parent, 'receipt.json');
  run('prepare', external('b-spec.json', spec('amendment', b, trigger, record)), bRequest);
  const checks = Object.fromEntries(['addressesTrigger', 'withinSelectedScope', 'authorityOnly', 'noUnrelatedChanges',
    'coherentResult', 'noUnsupportedClaims', 'predecessorAuthorized'].map(key => [key, true]));
  run('complete', bRequest, external('eligible.json', { semanticDecision: { decision: 'PASS', authorityFiles }, checks }), receiptPath);
  git(root, 'switch', 'main'); git(root, 'merge', '--no-ff', '--no-edit', b); const merge = git(root, 'rev-parse', 'HEAD');
  const finalPath = join(parent, 'final.json'); const report = run('observe', receiptPath, merge, finalPath);
  assert.equal(report.adoption, 'OBSERVED'); assert.equal(report.canonical, 'VERIFIED'); assert.equal(report.assurance.custody, 'UNVERIFIED');
  assert.equal(statSync(finalPath).mode & 0o777, 0o600);
  const repeated = spawnSync(process.execPath, [cli, 'observe', receiptPath, merge, finalPath], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(repeated.status, 2); assert.match(repeated.stderr, /EEXIST/);
  git(root, 'switch', '-c', 'fresh-a'); put(root, 'app.txt', 'A2 under new authority\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic fresh A');
  const freshPath = join(parent, 'fresh.json'); run('fresh-review', finalPath, git(root, 'rev-parse', 'HEAD'), freshPath);
  assert.equal(read(freshPath).spec.baseSha, merge); assert.match(read(freshPath).prompt, /proposed changed rule/);
  run('complete', freshPath, external('pass.json', { semanticDecision: { decision: 'PASS', authorityFiles }, checks: { predecessorAuthorized: true } }), join(parent, 'fresh-receipt.json'));
});
