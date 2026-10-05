import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';

const cli = process.env.PREVIEW_LIFECYCLE_SMOKE_CLI ?? fileURLToPath(new URL('../src/preview-lifecycle-cli.mjs', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, file, value) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const read = file => JSON.parse(readFileSync(file, 'utf8'));

test('installed ordinary CLI prepares and completes a private, exclusive receipt and rejects later routes', t => {
  const parent = mkdtempSync(join(tmpdir(), 'preview-ordinary-cli-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'consumer'); mkdirSync(root);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'CLI fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const authority = 'docs/authority.md', governance = 'docs/governance.md';
  const selectionPath = '.codex/gatekeeper/preview-lifecycle.json', policyPath = '.codex/gatekeeper/ci-policy.json';
  const promptPath = '.codex/gatekeeper/prompt.md', schemaPath = '.codex/gatekeeper/schema.json';
  put(root, authority, 'Selected architecture authority.\n'); put(root, governance, 'Owner selected preview procedure.\n'); put(root, 'app.txt', 'before\n');
  put(root, promptPath, 'Review the complete selected authority.\n');
  put(root, schemaPath, { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles'], properties: {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string', minLength: 1 },
    authorityFiles: { type: 'array', items: { type: 'string' } } } });
  put(root, '.github/workflows/architecture-gate.yml', 'uses: selected/reviewer@fixture\n');
  put(root, policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'fixture-model', reasoningEffort: 'low',
    authorityFiles: [authority, governance], promptPath, schemaPath, validationPath: null } } });
  put(root, selectionPath, { version: 1, profile: 'preview-unverified-procedure-v1', repository: 'fixture/example', targetBranch: 'main',
    governancePath: governance, authorization: 'Synthetic owner-selected preview procedure', policyPath, promptPath, schemaPath, validationPath: null,
    callerPath: '.github/workflows/architecture-gate.yml', authorityPaths: [authority], migrationPaths: [policyPath], maxPromptBytes: 524288,
    eligibilitySchemaPath: '.codex/gatekeeper/future.schema.json', eligibilityValidationPath: null, amendmentTriggerProfile: 'completed-block-v1' });
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Predecessor'); const baseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '-c', 'ordinary'); put(root, 'app.txt', 'candidate\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Ordinary review'); const headSha = git(root, 'rev-parse', 'HEAD');
  const invoke = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
  const specPath = join(parent, 'spec.json'), requestPath = join(parent, 'request.json');
  const spec = { version: 1, repository: 'fixture/example', targetBranch: 'main', baseSha, headSha, mode: 'review', selectionPath, trigger: null, record: null };
  put(parent, 'spec.json', spec);
  const prepared = invoke('prepare', specPath, requestPath); assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(statSync(requestPath).mode & 0o777, 0o600);
  assert.match(read(requestPath).prompt, /Report every selected predecessor Authority Set member exactly once/);
  const responsePath = join(parent, 'response.json'), receiptPath = join(parent, 'receipt.json');
  put(parent, 'response.json', { semanticDecision: { decision: 'PASS', summary: 'Synthetic actual CLI response.', authorityFiles: [authority, governance] }, checks: { predecessorAuthorized: true } });
  const completed = invoke('complete', requestPath, responsePath, receiptPath); assert.equal(completed.status, 0, completed.stderr);
  assert.equal(statSync(receiptPath).mode & 0o777, 0o600);
  const receipt = read(receiptPath); assert.equal(receipt.decision.decision, 'PASS'); assert.equal(receipt.eligibility, 'NOT_APPLICABLE');
  const repeat = invoke('complete', requestPath, responsePath, receiptPath); assert.equal(repeat.status, 2); assert.match(repeat.stderr, /EEXIST/);
  for (const mode of ['migration']) {
    const unsupportedPath = join(parent, `${mode}-spec.json`), outputPath = join(parent, `${mode}-request.json`);
    put(parent, `${mode}-spec.json`, { ...spec, mode, trigger: {}, record: {} });
    const rejected = invoke('prepare', unsupportedPath, outputPath); assert.equal(rejected.status, 2); assert.match(rejected.stderr, /unsupported spec/);
  }
  const rejectedObserve = invoke('observe', receiptPath, 'deadbeef', join(parent, 'ordinary-final.json'));
  assert.equal(rejectedObserve.status, 2); assert.match(rejectedObserve.stderr, /eligible selected B procedure/);
});


test('installed CLI executes only the synthetic BLOCK amendment cycle through fresh A', t => {
  const parent = mkdtempSync(join(tmpdir(), 'preview-block-cli-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'consumer'); mkdirSync(root);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'BLOCK CLI fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const authority = 'docs/architecture.md', governance = 'docs/governance.md';
  const selectionPath = '.codex/gatekeeper/preview-lifecycle.json', policyPath = '.codex/gatekeeper/ci-policy.json';
  const promptPath = '.codex/gatekeeper/prompt.md', schemaPath = '.codex/gatekeeper/schema.json';
  const eligibilitySchemaPath = '.codex/gatekeeper/eligibility.schema.json';
  put(root, authority, 'Existing required decision: predecessor rule.\n'); put(root, governance, 'Synthetic owner-selected unverified preview.\n'); put(root, 'app.txt', 'before\n');
  put(root, promptPath, 'Review the complete predecessor authority and candidate diff.\n');
  put(root, schemaPath, { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles'], properties: {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' }, authorityFiles: { type: 'array', items: { type: 'string' } } } });
  put(root, eligibilitySchemaPath, { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles'], properties: {
    decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] }, summary: { type: 'string' }, authorityFiles: { type: 'array', items: { type: 'string' } } } });
  put(root, '.github/workflows/architecture-gate.yml', 'uses: fixture/reviewer@fixed\n');
  put(root, policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'fixture-model', reasoningEffort: 'low',
    authorityFiles: [authority, governance], promptPath, schemaPath, validationPath: null } } });
  put(root, selectionPath, { version: 1, profile: 'preview-unverified-procedure-v1', repository: 'fixture/example', targetBranch: 'main',
    governancePath: governance, authorization: 'Synthetic owner selected BLOCK procedure', policyPath, promptPath, schemaPath, validationPath: null,
    eligibilitySchemaPath, eligibilityValidationPath: null, amendmentTriggerProfile: 'completed-block-v1',
    callerPath: '.github/workflows/architecture-gate.yml', authorityPaths: [authority], migrationPaths: [policyPath], maxPromptBytes: 524288 });
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic predecessor'); const baseSha = git(root, 'rev-parse', 'HEAD');
  const invoke = (...args) => { const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 30000 }); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  const input = (name, value) => { const file = join(parent, name); put(parent, name, value); return file; };
  const spec = (mode, headSha, trigger = null, record = null) => ({ version: 1, repository: 'fixture/example', targetBranch: 'main', baseSha, headSha, mode, selectionPath, trigger, record });
  git(root, 'switch', '-c', 'a'); put(root, 'app.txt', 'Synthetic A BLOCK candidate\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic A');
  const aHead = git(root, 'rev-parse', 'HEAD'), aRequest = join(parent, 'a-request.json'), triggerPath = join(parent, 'trigger.json');
  invoke('prepare', input('a-spec.json', spec('review', aHead)), aRequest);
  invoke('complete', aRequest, input('block.json', { semanticDecision: { decision: 'BLOCK', summary: 'Synthetic fixture response, not a model run.', authorityFiles: [authority, governance] }, checks: { predecessorAuthorized: true } }), triggerPath);
  git(root, 'switch', '-c', 'b', baseSha); put(root, authority, 'Existing required decision: synthetic clarified rule.\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic authority-only B');
  const bHead = git(root, 'rev-parse', 'HEAD'), trigger = read(triggerPath);
  const record = { version: 1, kind: 'preview-amendment-record', baseSha, bSha: bHead,
    triggerReceiptSha256: createHash('sha256').update(readFileSync(triggerPath)).digest('hex'), target: 'existing-rule', purpose: 'synthetic BLOCK resolution' };
  const bRequest = join(parent, 'b-request.json'), receiptPath = join(parent, 'b-receipt.json');
  invoke('prepare', input('b-spec.json', spec('amendment', bHead, trigger, record)), bRequest);
  const checks = Object.fromEntries(['addressesTrigger', 'withinSelectedScope', 'authorityOnly', 'noUnrelatedChanges', 'coherentResult', 'noUnsupportedClaims', 'predecessorAuthorized'].map(key => [key, true]));
  Object.assign(checks, { triggerMissingDecision: false, triggerExistingDecision: false, targetDecisionOnly: true });
  invoke('complete', bRequest, input('eligible.json', { semanticDecision: { decision: 'ELIGIBLE', summary: 'Synthetic fixture eligibility, not a model run.', authorityFiles: [authority, governance] }, checks }), receiptPath);
  git(root, 'switch', 'main'); git(root, 'merge', '--no-ff', '-m', `Synthetic B integration\n\nAGK-Preview-Receipt-v1: sha256:${createHash('sha256').update(readFileSync(receiptPath)).digest('hex')}`, 'b');
  const merge = git(root, 'rev-parse', 'HEAD'), finalPath = join(parent, 'final.json');
  assert.equal(invoke('observe', receiptPath, merge, finalPath).adoption, 'OBSERVED');
  git(root, 'switch', '-c', 'fresh-a'); put(root, 'app.txt', 'Synthetic fresh A\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Fresh A');
  const freshRequest = join(parent, 'fresh-request.json');
  invoke('fresh-review', finalPath, git(root, 'rev-parse', 'HEAD'), freshRequest);
  assert.equal(read(freshRequest).spec.baseSha, merge);
  const freshReceipt = join(parent, 'fresh-receipt.json');
  invoke('complete', freshRequest, input('fresh-pass.json', { semanticDecision: { decision: 'PASS', summary: 'Synthetic fixture response.', authorityFiles: [authority, governance] }, checks: { predecessorAuthorized: true } }), freshReceipt);
  assert.equal(statSync(receiptPath).mode & 0o777, 0o600); assert.equal(statSync(finalPath).mode & 0o777, 0o600);
});
