import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const put = (root, file, value) => {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
const authorityFiles = ['docs/authority.md', 'docs/governance.md'];
const ordinary = semanticDecision => ({ semanticDecision, checks: { predecessorAuthorized: true } });
const decision = () => ({ decision: 'PASS', summary: 'Synthetic response.', authorityFiles, valid: true });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'preview-source-runtime-fixture-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Synthetic fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  const selection = {
    version: 1, profile: 'preview-unverified-procedure-v1', repository: 'fixture/example', targetBranch: 'main',
    governancePath: authorityFiles[1], authorization: 'Synthetic unverified preview procedure.',
    policyPath: '.codex/gatekeeper/ci-policy.json', promptPath: '.codex/gatekeeper/ci-prompt.md',
    schemaPath: '.codex/gatekeeper/decision.schema.json', validationPath: '.codex/gatekeeper/rules.json',
    callerPath: '.github/workflows/architecture-gate.yml', authorityPaths: [authorityFiles[0]],
    migrationPaths: [selectionPath, '.codex/gatekeeper/ci-policy.json', '.github/workflows/architecture-gate.yml'],
    maxPromptBytes: 524288,
  };
  put(root, authorityFiles[0], 'Keep the selected predecessor rules.\n');
  put(root, authorityFiles[1], 'The owner may select an explicit preview procedure.\n');
  put(root, 'app.txt', 'Original application\n');
  put(root, selection.promptPath, 'Review the proposed change under full prior authority.\n');
  put(root, selection.callerPath, 'uses: owner/runtime@1111111111111111111111111111111111111111\n');
  put(root, selection.schemaPath, { type: 'object', additionalProperties: false,
    required: ['decision', 'summary', 'authorityFiles', 'valid'], properties: {
      decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' },
      authorityFiles: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' },
    } });
  put(root, selection.validationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' },
    require: { path: '/valid', equals: true }, message: 'Synthetic mandatory validator' }] });
  put(root, selection.policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityFiles,
    promptPath: selection.promptPath, schemaPath: selection.schemaPath, validationPath: selection.validationPath,
  } } });
  put(root, '.codex/gatekeeper/authorities.json', { version: 1, authorities: authorityFiles.map((path, index) => ({
    id: index ? 'governance' : 'contract', repository: 'self', revision: 'authority-revision', path,
  })) });
  put(root, selectionPath, selection);
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic predecessor');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '-c', 'source-runtime-identity');
  put(root, 'app.txt', 'Changed application\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic candidate');
  return { root, baseSha, headSha: git(root, 'rev-parse', 'HEAD') };
}

test('source runtime identity binds authored .mts and invalidates stale requests and receipts', async t => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'preview-source-runtime-layout-'));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  cpSync(new URL('../src', import.meta.url), join(sourceRoot, 'src'), { recursive: true });
  copyFileSync(new URL('../package.json', import.meta.url), join(sourceRoot, 'package.json'));
  const runtime = await import(pathToFileURL(join(sourceRoot, 'src/preview-lifecycle.mjs')).href);
  const f = fixture();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const spec = { version: 1, repository: 'fixture/example', targetBranch: 'main', mode: 'review',
    baseSha: f.baseSha, headSha: f.headSha, selectionPath, trigger: null, record: null };
  const request = await runtime.preparePreviewLifecycle(spec, f.root);
  assert.ok(request.runtime.files['authority-validation/authority-set.mts']);
  assert.ok(request.runtime.files['authority-set.mjs']);
  assert.equal(request.runtime.files['authority-validation/authority-set.mts'],
    sha256(readFileSync(join(sourceRoot, 'src/authority-validation/authority-set.mts'))));
  assert.equal(request.runtime.files['github/github-owner-addition-provenance.mts'],
    sha256(readFileSync(join(sourceRoot, 'src/github/github-owner-addition-provenance.mts'))));
  assert.equal(request.runtime.files['local-review/native-review.mts'],
    sha256(readFileSync(join(sourceRoot, 'src/local-review/native-review.mts'))));
  assert.equal(request.runtime.files['owner-addition/finalize-owner-addition.mts'],
    sha256(readFileSync(join(sourceRoot, 'src/owner-addition/finalize-owner-addition.mts'))));
  assert.equal(request.runtime.files['ci-review/ci-report-entrypoint.mts'],
    sha256(readFileSync(join(sourceRoot, 'src/ci-review/ci-report-entrypoint.mts'))));
  const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(receipt, f.root);

  appendFileSync(join(sourceRoot, 'src/authority-validation/authority-set.mts'), '\n// isolated source-byte mutation\n');
  const changedRequest = await runtime.preparePreviewLifecycle(spec, f.root);
  assert.notEqual(changedRequest.runtime.files['authority-validation/authority-set.mts'],
    request.runtime.files['authority-validation/authority-set.mts']);
  await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root),
    /request differs from immutable predecessor inputs/);
  await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root),
    /request differs from immutable predecessor inputs/);

  const freshReceipt = await runtime.completePreviewLifecycle(changedRequest, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(freshReceipt, f.root);
  appendFileSync(join(sourceRoot, 'src/ci-review/ci-report-entrypoint.mts'), '\n// isolated report source-byte mutation\n');
  const reportChanged = await runtime.preparePreviewLifecycle(spec, f.root);
  assert.notEqual(reportChanged.runtime.files['ci-review/ci-report-entrypoint.mts'],
    changedRequest.runtime.files['ci-review/ci-report-entrypoint.mts']);
  await assert.rejects(runtime.completePreviewLifecycle(changedRequest, ordinary(decision()), f.root),
    /request differs from immutable predecessor inputs/);
  await assert.rejects(runtime.validatePreviewReceipt(freshReceipt, f.root),
    /request differs from immutable predecessor inputs/);
  const reportFreshReceipt = await runtime.completePreviewLifecycle(reportChanged, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(reportFreshReceipt, f.root);
});
