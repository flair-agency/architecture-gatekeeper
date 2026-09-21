import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runManualReviewCli, validate } from '../src/local-gate.mjs';

const cfg = { requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'] };
test('accepts explicit PASS scope', () => assert.equal(validate({ decision: 'PASS', authorityFiles: ['AGENTS.md'], reviewedScope: ['change'] }, cfg).decision, 'PASS'));
test('packages the manual review CLI', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.bin['architecture-gatekeeper'], 'src/hook.mjs');
  assert.equal(manifest.bin['architecture-review'], 'src/manual-review.mjs');
  assert.equal(manifest.bin['architecture-gate-policy'], 'src/ci-policy.mjs');
  assert.match(readFileSync(new URL('../src/hook.mjs', import.meta.url), 'utf8'), /runHookCli\(\)/);
  assert.match(readFileSync(new URL('../src/manual-review.mjs', import.meta.url), 'utf8'), /runManualReviewCli\(\)/);
  assert.match(readFileSync(new URL('../src/ci-policy.mjs', import.meta.url), 'utf8'), /runCiPolicyCli\(\)/);
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
const args = process.argv.slice(2);
const output = args[args.indexOf('--output-last-message') + 1];
let input = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  if (process.env.CODEX_CAPTURE_PATH) writeFileSync(process.env.CODEX_CAPTURE_PATH, input);
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

test('manual review selects committed inputs without policing worktree bytes', t => {
  const fixture = manualFixture(t);
  const capture = join(fixture.root, 'captured-prompt.txt');
  writeFileSync(join(fixture.root, 'AGENTS.md'), '# Uncommitted replacement\n');
  const result = runManual(fixture, { CODEX_CAPTURE_PATH: capture });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'BLOCK');
  const reviewed = readFileSync(capture, 'utf8');
  assert.match(reviewed, /"content":"# Test authority\\n"/);
  assert.doesNotMatch(reviewed, /Uncommitted replacement/);
});

test('local runtime does not implement Git or worktree integrity monitoring', () => {
  const source = readFileSync(new URL('../src/local-gate.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /hash-object|assertCommittedInputs|revision changed during review/);
  assert.match(source, /'--enable', 'skip_host_skill_discovery'/);
});
