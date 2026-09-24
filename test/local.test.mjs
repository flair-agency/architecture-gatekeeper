import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runManualReviewCli, validate } from '../src/local-gate.mjs';
import { createReviewRequest, createReviewRequestAsync, validateReviewResponse } from '../src/review-contract.mjs';

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
  writeFileSync(output, process.env.MOCK_DECISION_JSON || JSON.stringify({ decision: 'BLOCK', summary: 'fixture block', authorityFiles: ['AGENTS.md'], reviewedScope: ['fixture'] }));
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

const v2Limits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 };
function adoptV2(fixture, overrides = {}) {
  const gate = join(fixture.root, '.codex', 'gatekeeper');
  writeFileSync(join(gate, 'authorities.json'), JSON.stringify({ version: 1, authorities: [{ id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'AGENTS.md' }] }));
  writeFileSync(join(gate, 'schema.json'), JSON.stringify({ type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityIds', 'reviewedScope'], properties: { decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' }, authorityIds: { type: 'array', minItems: 1, items: { type: 'string' } }, reviewedScope: { type: 'array', items: { type: 'string' } } } }));
  writeFileSync(join(gate, 'config.json'), JSON.stringify({ version: 2, selfRepository: 'example/consumer', authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: v2Limits, requiredPassArrays: ['reviewedScope'], promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000, ...overrides }));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'adopt local Authority Set');
}

test('v2 manual and native review use the complete committed self Authority Set', async t => {
  const fixture = manualFixture(t); adoptV2(fixture);
  const recorded = git(fixture.root, 'rev-parse', 'HEAD');
  writeFileSync(join(fixture.root, 'AGENTS.md'), '# Uncommitted replacement\n');
  const request = await createReviewRequestAsync('Review version 2', fixture.root);
  assert.equal(request.version, 2);
  assert.equal(request.reviewedRevision, recorded);
  assert.match(request.prompt, /# Test authority/);
  assert.doesNotMatch(request.prompt, /Uncommitted replacement/);
  assert.deepEqual(request.authoritySet.members.map(member => member.id), ['architecture']);
  assert.match(request.authoritySet.members[0].sha256, /^[a-f0-9]{64}$/);
  for (const decision of ['PASS', 'BLOCK', 'OWNER_DECISION']) {
    const result = validateReviewResponse(request, { decision, summary: 'fixture', authorityIds: ['architecture'], reviewedScope: ['fixture'] });
    assert.equal(result.decision, decision);
    assert.equal(result.authoritySet.members[0].resolvedCommit, recorded);
    assert.throws(() => validateReviewResponse(request, { decision, summary: 'fixture', authorityIds: ['other'], reviewedScope: ['fixture'] }), /Authority Set/);
  }
  assert.throws(() => createReviewRequest('v1 path', fixture.root), /async request path/);
  const capture = join(fixture.root, 'prompt.txt');
  const result = runManual(fixture, { CODEX_CAPTURE_PATH: capture, MOCK_DECISION_JSON: JSON.stringify({ decision: 'BLOCK', summary: 'fixture', authorityIds: ['architecture'], reviewedScope: ['fixture'] }) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).authoritySet.members[0].id, 'architecture');
  assert.match(readFileSync(capture, 'utf8'), /Report exactly these IDs in authorityIds/);
});

test('v2 selected external authority and oversized complete prompt fail before review', async t => {
  const fixture = manualFixture(t); adoptV2(fixture);
  const gate = join(fixture.root, '.codex', 'gatekeeper');
  writeFileSync(join(gate, 'authorities.json'), JSON.stringify({ version: 1, authorities: [{ id: 'external', repository: 'elsewhere/authority', revision: 'a'.repeat(40), path: 'architecture.md' }] }));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'select external');
  await assert.rejects(createReviewRequestAsync('Review', fixture.root), /external sources are unavailable/);
  const result = runManual(fixture);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  writeFileSync(join(gate, 'authorities.json'), JSON.stringify({ version: 1, authorities: [{ id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'AGENTS.md' }] }));
  writeFileSync(join(gate, 'config.json'), JSON.stringify({ version: 2, selfRepository: 'example/consumer', authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: { ...v2Limits, maxPromptBytes: 700 }, requiredPassArrays: ['reviewedScope'], promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000 }));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'small prompt limit');
  await assert.rejects(createReviewRequestAsync('Review', fixture.root), /complete local review prompt exceeds limit/);
});

test('v2 rejects ambiguous configuration and schemas before running a reviewer', async t => {
  const fixture = manualFixture(t); adoptV2(fixture);
  const gate = join(fixture.root, '.codex', 'gatekeeper');
  const configPath = join(gate, 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify({ ...config, authorityFiles: ['AGENTS.md'] }));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'ambiguous config');
  await assert.rejects(createReviewRequestAsync('Review', fixture.root), /version 2 configuration is unsupported/);
  writeFileSync(configPath, JSON.stringify(config));
  writeFileSync(join(gate, 'schema.json'), JSON.stringify({ type: 'object', properties: { decision: { type: 'string' } } }));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'schema omits IDs');
  await assert.rejects(createReviewRequestAsync('Review', fixture.root), /must require authorityIds/);
  writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('"version":2', '"version":2,"version":1'));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'duplicate version key');
  await assert.rejects(createReviewRequestAsync('Review', fixture.root), /configuration is invalid/);
});

test('v2 includes Hook context inside the complete prompt limit', async t => {
  const fixture = manualFixture(t); adoptV2(fixture);
  const request = await createReviewRequestAsync('Review', fixture.root);
  const context = { decision: 'PASS', summary: 'prior review' };
  const withContext = await createReviewRequestAsync('Review', fixture.root, context);
  assert.match(withContext.prompt, /Prior structured review context/);
  assert.ok(Buffer.byteLength(withContext.prompt) > Buffer.byteLength(request.prompt));
  const configPath = join(fixture.root, '.codex', 'gatekeeper', 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.authorityLimits.maxPromptBytes = Buffer.byteLength(withContext.prompt) - 1;
  writeFileSync(configPath, JSON.stringify(config));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'bound context');
  await assert.rejects(createReviewRequestAsync('Review', fixture.root, context), /complete local review prompt exceeds limit/);
});

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
  assert.throws(() => validateReviewResponse(request, []), /must match type object/);
});

test('native adapter supports local refs and fails closed on malformed schema keywords', t => {
  const fixture = manualFixture(t);
  const schemaPath = join(fixture.root, '.codex', 'gatekeeper', 'schema.json');
  writeFileSync(schemaPath, JSON.stringify({
    $defs: {
      text: { anyOf: [{ type: 'string', minLength: 1 }, { enum: ['fallback'] }] },
      decision: {
        type: 'object', additionalProperties: false,
        required: ['decision', 'authorityFiles', 'reviewedScope'],
        properties: {
          decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
          authorityFiles: { type: 'array', minItems: 1, items: { $ref: '#/$defs/text' } },
          reviewedScope: { type: 'array', minItems: 1, items: { $ref: '#/$defs/text' } }
        }
      }
    },
    $ref: '#/$defs/decision'
  }));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'referenced schema');
  let request = createReviewRequest('Review referenced schema', fixture.root);
  assert.equal(validateReviewResponse(request, { decision: 'PASS', authorityFiles: ['AGENTS.md'], reviewedScope: ['native'] }).decision, 'PASS');

  writeFileSync(schemaPath, JSON.stringify({ type: null, enum: null }));
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'malformed schema');
  request = createReviewRequest('Review malformed schema', fixture.root);
  assert.throws(() => validateReviewResponse(request, {}), /schema validation failed/);
});
