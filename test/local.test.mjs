import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runManualReviewCli, validate } from '../src/local-gate.mjs';
import { createReviewRequest, validateReviewResponse } from '../src/review-contract.mjs';

const cfg = { authorityFiles: ['AGENTS.md'], requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'] };
test('accepts explicit PASS scope', () => assert.equal(validate({ decision: 'PASS', authorityFiles: ['AGENTS.md'], reviewedScope: ['change'] }, cfg).decision, 'PASS'));
test('rejects reported authority outside the configured boundary', () => assert.throws(
  () => validate({ decision: 'BLOCK', authorityFiles: ['AGENTS.md', 'src/current.mjs'] }, cfg),
  /outside the configured boundary/
));
test('packages the manual review CLI', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.bin['architecture-review'], 'src/manual-review.mjs');
  assert.match(readFileSync(new URL('../src/manual-review.mjs', import.meta.url), 'utf8'), /runManualReviewCli\(\)/);
  assert.equal(typeof runManualReviewCli, 'function');
});

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function manualFixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'architecture review test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'consumer repository');
  const gate = join(root, '.codex', 'gatekeeper');
  const bin = join(root, 'bin');
  mkdirSync(gate, { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(root, 'AGENTS.md'), '# Test authority\n');
  writeFileSync(join(gate, 'prompt.md'), 'Review only the configured authority.\n');
  writeFileSync(join(gate, 'schema.json'), JSON.stringify({ type: 'object' }));
  writeFileSync(join(gate, 'reviewer.json'), JSON.stringify({ model: 'test-model', reasoningEffort: 'low' }));
  writeFileSync(join(gate, 'config.json'), JSON.stringify({
    version: 1,
    authorityFiles: ['AGENTS.md'],
    requiredReportedAuthorityFiles: ['AGENTS.md'],
    requiredPassArrays: ['reviewedScope'],
    promptPath: '.codex/gatekeeper/prompt.md',
    schemaPath: '.codex/gatekeeper/schema.json',
    reviewerConfigPath: '.codex/gatekeeper/reviewer.json',
    reviewTimeoutMs: 5000
  }));
  const codex = join(bin, 'codex');
  writeFileSync(codex, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const output = args[args.indexOf('--output-last-message') + 1];
let input = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  if (process.env.CODEX_CAPTURE_PATH) writeFileSync(process.env.CODEX_CAPTURE_PATH, input);
  if (process.env.MOCK_CHANGE_REVISION) spawnSync('git', ['commit', '--allow-empty', '-m', 'change revision'], { cwd: process.cwd() });
  writeFileSync(output, JSON.stringify({ decision: 'BLOCK', summary: 'fixture block', authorityFiles: ['AGENTS.md'], reviewedScope: ['fixture'] }));
});
`);
  chmodSync(codex, 0o755);
  git(root, 'init');
  const hooks = join(root, '.git', 'test-hooks');
  mkdirSync(hooks);
  git(root, 'config', 'core.hooksPath', hooks);
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'commit.gpgSign', 'false');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  return { root, bin };
}

function runManual({ root, bin }, extraEnv = {}) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../src/manual-review.mjs', import.meta.url)), 'Review this boundary'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...extraEnv }
  });
}

test('manual review returns BLOCK without Hook context, Hook output or session state', t => {
  const fixture = manualFixture(t);
  const capture = join(fixture.root, 'prompt.txt');
  const result = runManual(fixture, { CODEX_CAPTURE_PATH: capture });
  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'BLOCK');
  assert.equal(typeof decision.reviewedRevision, 'string');
  assert.equal('hookSpecificOutput' in decision, false);
  assert.doesNotMatch(readFileSync(capture, 'utf8'), /prior-review|session_id|UserPromptSubmit/);
  assert.equal(existsSync(join(fixture.root, '.git', 'codex-architecture-context')), false);
});

test('manual review uses committed authority when the worktree differs', t => {
  const fixture = manualFixture(t);
  writeFileSync(join(fixture.root, 'AGENTS.md'), '# Uncommitted replacement\n');
  const capture = join(fixture.root, 'prompt.txt');
  const result = runManual(fixture, { CODEX_CAPTURE_PATH: capture });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(capture, 'utf8'), /# Test authority/);
  assert.doesNotMatch(readFileSync(capture, 'utf8'), /Uncommitted replacement/);
});

test('manual review reports the recorded revision when HEAD changes during review', t => {
  const fixture = manualFixture(t);
  const recorded = git(fixture.root, 'rev-parse', 'HEAD');
  const result = runManual(fixture, { MOCK_CHANGE_REVISION: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).reviewedRevision, recorded);
  assert.notEqual(git(fixture.root, 'rev-parse', 'HEAD'), recorded);
});

test('native review adapter prepares a self-bound request and validates a host decision', t => {
  const fixture = manualFixture(t);
  const request = createReviewRequest('Review native transport', fixture.root);
  assert.match(request.prompt, /# Test authority/);
  assert.equal(request.reviewer.model, 'test-model');
  assert.equal(request.reviewer.reviewTimeoutMs, 5000);
  const result = validateReviewResponse(request, { decision: 'BLOCK', authorityFiles: ['AGENTS.md'], reviewedScope: ['native'] });
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reviewedRevision, git(fixture.root, 'rev-parse', 'HEAD'));
});

test('native review adapter fails closed on a modified request or schema-invalid decision', t => {
  const fixture = manualFixture(t);
  const request = createReviewRequest('Review native transport', fixture.root);
  assert.throws(() => validateReviewResponse({ ...request, prompt: 'replacement' }, {}), /request was modified/);
  assert.throws(() => validateReviewResponse(request, []), /must be object/);
});
