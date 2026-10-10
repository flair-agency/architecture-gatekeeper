import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { observePreviewLifecycle, previewReceiptBytes } from '../src/preview-lifecycle.mjs';
import { rejectDuplicateJsonKeys } from '../src/authority-set.mjs';
import { decision, fixture, ordinary, spec, selectionPath, commitOn, put } from './fixtures/preview-lifecycle-runtime.mjs';

const cli = new URL('../src/preview-lifecycle-cli.mts', import.meta.url);
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function invoke(root, command, input, args = [], entry = cli) {
  return spawnSync(process.execPath, [entry.pathname, command, ...args], { cwd: root,
    input, encoding: null, maxBuffer: 20 * 1024 * 1024, timeout: 30_000 });
}
function run(root, command, value) {
  const result = invoke(root, command, Buffer.from(JSON.stringify(value)));
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stderr.length, 0);
  assert.deepEqual(result.stdout, previewReceiptBytes(JSON.parse(result.stdout.toString('utf8'))));
  assert.notEqual(result.stdout.at(-1), 0x0a, 'canonical output has no trailing newline');
  return result.stdout;
}
function runEntry(root, command, value, entry) {
  const result = invoke(root, command, Buffer.from(JSON.stringify(value)), [], entry);
  assert.equal(result.status, 0, result.stderr.toString());
  assert.deepEqual(result.stdout, previewReceiptBytes(JSON.parse(result.stdout.toString('utf8'))));
  assert.notEqual(result.stdout.at(-1), 0x0a);
  return result.stdout;
}
function addRecursiveDecisionSchema(f) {
  git(f.root, 'switch', '-c', 'cli-recursive-schema');
  for (const path of [f.selection.schemaPath, f.selection.eligibilitySchemaPath]) {
    const schema = JSON.parse(readFileSync(join(f.root, path), 'utf8'));
    schema.$defs = { deep: { type: 'object', additionalProperties: false,
      properties: { child: { $ref: '#/$defs/deep' } } } };
    schema.properties.nested = { $ref: '#/$defs/deep' };
    put(f.root, path, schema);
  }
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Select bounded recursive response schema');
  f.base = git(f.root, 'rev-parse', 'HEAD');
}
function depthBoundedDecision(kind, childCount = 62) {
  let nested = {};
  for (let index = 0; index < childCount; index++) nested = { child: nested };
  return { ...decision(kind), nested };
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().reverse().map(key => [key, reverseKeys(value[key])]));
  }
  return value;
}
function failed(root, command, input, pattern) {
  const result = invoke(root, command, input);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.length, 0);
  assert.ok(result.stderr.length <= 600);
  assert.match(result.stderr.toString(), pattern);
}

test('depth-64 A response triggers depth-68 B receipt through finalize and fresh review', async t => {
  const f = fixture(t);
  addRecursiveDecisionSchema(f);
  const selection = { ...f.selection, targetBranch: 'release/preview' };
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const policy = JSON.parse(readFileSync(join(f.root, policyPath), 'utf8'));
  policy.branches['release/preview'] = policy.branches.main;
  delete policy.branches.main;
  put(f.root, selectionPath, selection); put(f.root, policyPath, policy);
  git(f.root, 'add', selectionPath, policyPath); git(f.root, 'commit', '-m', 'Select non-main preview target');
  f.base = git(f.root, 'rev-parse', 'HEAD');
  f.selection = selection;
  git(f.root, 'switch', '-c', 'release/preview', f.base);
  const aHead = commitOn(f, 'cli-a-block', { 'app.txt': 'A change under review\n' });
  const request = JSON.parse(run(f.root, 'prepare', { spec: { ...spec(f, 'review', aHead), targetBranch: 'release/preview' } }).toString());
  assert.equal(request.profile, 'preview-unverified-procedure-v1');
  assert.equal(request.assurance.custody, 'UNVERIFIED');
  const trigger = JSON.parse(run(f.root, 'complete', { request,
    responseJson: JSON.stringify(ordinary(depthBoundedDecision('BLOCK'))) }).toString());
  assert.equal(trigger.decision.decision, 'BLOCK');
  assert.equal(trigger.adoption, 'PENDING');

  const bHead = commitOn(f, 'cli-b-block-resolution', { 'docs/authority.md': 'Existing rule: clarified rule.\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: f.base, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(trigger)), target: 'existing-required-decision', purpose: 'Synthetic CLI integration fixture.' };
  const bRequest = JSON.parse(run(f.root, 'prepare', { spec: { ...spec(f, 'amendment', bHead, trigger, record), targetBranch: 'release/preview' } }).toString());
  const response = { semanticDecision: decision('ELIGIBLE'), checks: { addressesTrigger: true,
    withinSelectedScope: true, authorityOnly: true, noUnrelatedChanges: true, coherentResult: true,
    noUnsupportedClaims: true, predecessorAuthorized: true, triggerMissingDecision: false,
    triggerExistingDecision: false, targetDecisionOnly: true } };
  const ineligibleResponse = structuredClone(response);
  ineligibleResponse.semanticDecision.decision = 'INELIGIBLE';
  const ineligible = JSON.parse(run(f.root, 'complete', { request: bRequest,
    responseJson: JSON.stringify(ineligibleResponse) }).toString());
  assert.equal(ineligible.eligibility, 'INELIGIBLE');
  failed(f.root, 'finalize', Buffer.from(JSON.stringify({ receiptJson: previewReceiptBytes(ineligible).toString(),
    integrationSha: bHead })), /finalize failed/);
  const receiptText = run(f.root, 'complete', { request: bRequest, responseJson: JSON.stringify(response) }).toString('utf8');
  const receipt = JSON.parse(receiptText);
  assert.equal(receipt.eligibility, 'ELIGIBLE');
  assert.equal(receipt.assurance.hostEnforcement, 'UNVERIFIED');
  assert.doesNotThrow(() => rejectDuplicateJsonKeys(receiptText, 'max-depth B receipt', { maxDepth: 68 }));
  const oneLevelDeeper = `${receiptText.slice(0, -1)},"depthProbe":${'['.repeat(68)}null${']'.repeat(68)}}`;
  assert.throws(() => rejectDuplicateJsonKeys(oneLevelDeeper, 'over-depth receipt', { maxDepth: 68 }), /nesting is too deep/);

  git(f.root, 'switch', 'release/preview');
  git(f.root, 'merge', '--no-ff', '-m', `Synthetic integration\n\nAGK-Preview-Receipt-v1: sha256:${sha(Buffer.from(receiptText))}`, bHead);
  const integrationSha = git(f.root, 'rev-parse', 'HEAD');
  const nonFiniteReceiptText = receiptText.replace(/"version":1/, '"version":1e400');
  assert.notEqual(nonFiniteReceiptText, receiptText);
  failed(f.root, 'finalize', Buffer.from(JSON.stringify({ receiptJson: nonFiniteReceiptText, integrationSha })), /JSON is invalid/);
  const reorderedReceiptText = JSON.stringify(reverseKeys(receipt));
  assert.notEqual(reorderedReceiptText, receiptText);
  const reorderedIntegrationSha = execFileSync('git', ['-C', f.root, '-c', 'commit.gpgsign=false', 'commit-tree',
    `${bHead}^{tree}`, '-p', f.base, '-p', bHead], {
    input: `Synthetic reordered receipt integration\n\nAGK-Preview-Receipt-v1: sha256:${sha(Buffer.from(reorderedReceiptText))}\n`,
    encoding: 'utf8' }).trim();
  git(f.root, 'update-ref', 'refs/heads/release/preview', reorderedIntegrationSha);
  await observePreviewLifecycle(receipt, reorderedIntegrationSha, f.root, Buffer.from(reorderedReceiptText));
  failed(f.root, 'finalize', Buffer.from(JSON.stringify({ receiptJson: reorderedReceiptText,
    integrationSha: reorderedIntegrationSha })), /finalize failed/);
  git(f.root, 'update-ref', 'refs/heads/release/preview', integrationSha);
  failed(f.root, 'finalize', Buffer.from(JSON.stringify({ receiptJson: oneLevelDeeper, integrationSha })), /JSON nesting exceeds the supported depth/);
  await assert.rejects(observePreviewLifecycle(receipt, integrationSha, f.root, Buffer.from(oneLevelDeeper)), /nesting is too deep/);
  await observePreviewLifecycle(receipt, integrationSha, f.root, Buffer.from(receiptText));
  failed(f.root, 'finalize', Buffer.from(JSON.stringify({ receiptJson: `${receiptText} `, integrationSha })), /finalize failed/);
  failed(f.root, 'finalize', Buffer.from(JSON.stringify({ receiptJson: receiptText, integrationSha: f.base })), /finalize failed/);
  const finalBytes = run(f.root, 'finalize', { receiptJson: receiptText, integrationSha });
  const finalRecord = JSON.parse(finalBytes.toString());
  assert.equal(finalRecord.adoption, 'OBSERVED');
  assert.equal(finalRecord.canonical, 'VERIFIED');
  assert.equal(finalRecord.receiptBytesBase64, Buffer.from(receiptText).toString('base64'));

  const freshHead = commitOn(f, 'cli-fresh-a', { 'app.txt': 'fresh successor review\n' }, finalRecord.targetSha);
  const fresh = JSON.parse(run(f.root, 'fresh', { finalRecord, aHeadSha: freshHead }).toString());
  assert.equal(fresh.spec.mode, 'review');
  assert.equal(fresh.spec.baseSha, finalRecord.targetSha);
  assert.equal(fresh.assurance.producerAuthentication, 'UNVERIFIED');
  assert.ok(Buffer.byteLength(JSON.stringify({ finalRecord, aHeadSha: freshHead })) < 16 * 1024 * 1024,
    'the largest exercised valid input packet fits the runtime input ceiling');
});

test('CLI rejects malformed envelopes, duplicate keys, invalid UTF-8, oversized input and unknown commands without stdout', t => {
  const f = fixture(t);
  const responseSchema = JSON.parse(readFileSync(join(f.root, f.selection.schemaPath), 'utf8'));
  responseSchema.properties.magnitude = { type: 'number' };
  put(f.root, f.selection.schemaPath, responseSchema);
  git(f.root, 'add', f.selection.schemaPath);
  git(f.root, 'commit', '-m', 'Allow a finite numeric response field');
  f.base = git(f.root, 'rev-parse', 'HEAD');
  const head = commitOn(f, 'cli-invalid-target', { 'app.txt': 'invalid target negative\n' });
  failed(f.root, 'prepare', Buffer.from('{"spec":{},"extra":true}'), /prepare failed/);
  failed(f.root, 'prepare', Buffer.from('{"spec":{"version":1e400}}'), /JSON is invalid/);
  const duplicate = invoke(f.root, 'prepare', Buffer.from('{"spec":{"token-value":"dont-print"},"spec":{}}'));
  assert.notEqual(duplicate.status, 0);
  assert.equal(duplicate.stdout.length, 0);
  assert.match(duplicate.stderr.toString(), /duplicate keys/);
  assert.doesNotMatch(duplicate.stderr.toString(), /token-value|dont-print/);
  failed(f.root, 'prepare', Buffer.from([0xff]), /not valid UTF-8/);
  failed(f.root, 'prepare', Buffer.alloc(16 * 1024 * 1024 + 1, 0x20), /exceeds 16 MiB/);
  failed(f.root, 'unknown', Buffer.from('{}'), /expected prepare/);
  failed(f.root, 'prepare', Buffer.from(JSON.stringify({ spec: { ...spec(f, 'review', 'a'.repeat(40)), mode: 'unselected' } })), /prepare failed/);
  failed(f.root, 'prepare', Buffer.from(JSON.stringify({ spec: { ...spec(f, 'review', head), repository: 'other/repository' } })), /prepare failed/);
  failed(f.root, 'prepare', Buffer.from(JSON.stringify({ spec: { ...spec(f, 'review', head), targetBranch: 'unselected-target' } })), /prepare failed/);

  const aRequest = JSON.parse(run(f.root, 'prepare', { spec: spec(f, 'review', head) }).toString());
  const finiteResponse = JSON.stringify(ordinary({ ...decision('PASS'), magnitude: 1 }));
  const finiteReceipt = JSON.parse(run(f.root, 'complete', { request: aRequest, responseJson: finiteResponse }).toString());
  assert.equal(finiteReceipt.response.semanticDecision.magnitude, 1);
  failed(f.root, 'complete', Buffer.from(JSON.stringify({ request: aRequest,
    responseJson: '{"semanticDecision":{"decision":"PASS","summary":"ok","authorityFiles":["docs/authority.md","docs/governance.md"],"valid":true,"magnitude":1e400},"checks":{"predecessorAuthorized":true}}' })), /JSON is invalid/);
  failed(f.root, 'complete', Buffer.from(JSON.stringify({ request: aRequest,
    responseJson: '{"semanticDecision":{"decision":"PASS","summary":"ok","authorityFiles":["docs/authority.md","docs/governance.md"],"valid":true,"magnitude":-1e400},"checks":{"predecessorAuthorized":true}}' })), /JSON is invalid/);
  const passTrigger = JSON.parse(run(f.root, 'complete', { request: aRequest,
    responseJson: JSON.stringify(ordinary(decision('PASS'))) }).toString());
  const bHead = commitOn(f, 'cli-invalid-trigger-b', { 'docs/authority.md': 'Proposed unrelated trigger target change.\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: f.base, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(passTrigger)), target: 'existing-required-decision',
    purpose: 'Synthetic invalid-trigger negative.' };
  failed(f.root, 'prepare', Buffer.from(JSON.stringify({
    spec: spec(f, 'amendment', bHead, passTrigger, record) })), /prepare failed/);

  const excessive = `${'['.repeat(130)}0${']'.repeat(130)}`;
  failed(f.root, 'prepare', Buffer.from(`{"spec":${excessive}}`), /supported depth/);
});

test('CLI rejects prepare from a checkout subdirectory so its emitted root remains reusable', t => {
  const f = fixture(t);
  const head = commitOn(f, 'cli-subdirectory-prepare', { 'app.txt': 'subdirectory invocation\n' });
  const nested = join(f.root, 'nested');
  mkdirSync(nested);
  failed(nested, 'prepare', Buffer.from(JSON.stringify({ spec: spec(f, 'review', head) })), /checkout does not match/);
  const request = JSON.parse(run(f.root, 'prepare', { spec: spec(f, 'review', head) }).toString());
  assert.equal(request.root, realpathSync(f.root));
});

test('CLI contains an actual broken-pipe stdout failure without leaking a stack', async t => {
  const f = fixture(t);
  const head = commitOn(f, 'cli-broken-stdout', { 'app.txt': 'broken stdout regression\n' });
  const child = spawn(process.execPath, [cli.pathname, 'prepare'], { cwd: f.root, stdio: ['pipe', 'pipe', 'pipe'] });
  const stderr = [];
  child.stderr.on('data', chunk => stderr.push(chunk));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000);
  t.after(() => clearTimeout(timeout));
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  child.stdout.destroy();
  child.stdin.end(Buffer.from(JSON.stringify({ spec: spec(f, 'review', head) })));
  const { code, signal } = await closed;
  assert.equal(signal, null);
  assert.notEqual(code, 0);
  const message = Buffer.concat(stderr).toString('utf8');
  assert.ok(Buffer.byteLength(message) <= 600);
  assert.match(message, /stdout write failed; the result may be incomplete/);
  assert.doesNotMatch(message, /Error:|\bat\s+.+:\d+:\d+/);
});

test('CLI withholds a completed receipt that exceeds the existing 4 MiB observation limit', t => {
  const f = fixture(t);
  const head = commitOn(f, 'cli-oversized-receipt', { 'app.txt': 'large response test\n' });
  const request = JSON.parse(run(f.root, 'prepare', { spec: spec(f, 'review', head) }).toString());
  const largeDecision = decision('PASS');
  largeDecision.summary = 'x'.repeat(2_200_000);
  const result = invoke(f.root, 'complete', Buffer.from(JSON.stringify({ request,
    responseJson: JSON.stringify(ordinary(largeDecision)) })));
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.length, 0);
  assert.match(result.stderr.toString(), /exceeds 4 MiB/);
});

test('CLI pins execution to the invoking checkout and fails closed on invalid or altered records', t => {
  const f = fixture(t);
  const other = mkdtempSync(join(tmpdir(), 'preview-cli-other-root-'));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  git(other, 'init', '-b', 'main');
  const head = commitOn(f, 'cli-root-test', { 'app.txt': 'root check\n' });
  const request = JSON.parse(run(f.root, 'prepare', { spec: spec(f, 'review', head) }).toString());
  const wrongRoot = invoke(other, 'complete', Buffer.from(JSON.stringify({ request,
    responseJson: JSON.stringify(ordinary(decision())) })));
  assert.notEqual(wrongRoot.status, 0);
  assert.equal(wrongRoot.stdout.length, 0);
  assert.match(wrongRoot.stderr.toString(), /checkout does not match/);

  failed(f.root, 'complete', Buffer.from(JSON.stringify({ request,
    responseJson: '{"semanticDecision":{},"semanticDecision":{},"checks":{}}' })), /duplicate keys/);
  failed(f.root, 'complete', Buffer.from(JSON.stringify({ request, responseJson: '{' })), /JSON is invalid/);
  failed(f.root, 'finalize', Buffer.from(JSON.stringify({ receiptJson: '{}', integrationSha: 'bad' })), /checkout does not match/i);
});

test('emitted CLI runs through a .bin symlink with the installed-style argv path', t => {
  const f = fixture(t);
  const head = commitOn(f, 'cli-emitted-entry', { 'app.txt': 'emitted runtime entry\n' });
  const emitted = new URL('../dist/preview-lifecycle-cli.mjs', import.meta.url);
  const binDir = mkdtempSync(join(tmpdir(), 'preview-cli-bin-'));
  t.after(() => rmSync(binDir, { recursive: true, force: true }));
  const bin = join(binDir, 'architecture-preview-lifecycle');
  symlinkSync(emitted.pathname, bin);
  const entry = { pathname: bin };
  const request = JSON.parse(runEntry(f.root, 'prepare', { spec: spec(f, 'review', head) }, entry).toString());
  const receipt = JSON.parse(runEntry(f.root, 'complete', { request,
    responseJson: JSON.stringify(ordinary(decision('OWNER_DECISION'))) }, entry).toString());
  assert.equal(receipt.decision.decision, 'OWNER_DECISION');
  assert.equal(receipt.assurance.producerAuthentication, 'UNVERIFIED');
});

test('CLI child composition supports addition and existing-choice amendment through merge finalization and fresh review', t => {
  for (const kind of ['addition', 'owner-amendment']) {
    const f = fixture(t, true, kind === 'owner-amendment');
    const ownerDecision = decision('OWNER_DECISION');
    if (kind === 'owner-amendment') ownerDecision.summary = 'Owner decision: change the existing required decision while preserving unrelated rules.';
    const aHead = commitOn(f, `cli-${kind}-a`, { 'app.txt': `A for ${kind}\n` });
    const aRequest = JSON.parse(run(f.root, 'prepare', { spec: spec(f, 'review', aHead) }).toString());
    const trigger = JSON.parse(run(f.root, 'complete', { request: aRequest,
      responseJson: JSON.stringify(ordinary(ownerDecision)) }).toString());
    let mode; let target; let authorityText;
    if (kind === 'addition') {
      mode = 'addition'; target = 'choice-1';
      authorityText = 'Existing rule: keep selected predecessor rules.\n\nNew decision: choice-1 is required.\n';
    } else {
      mode = 'amendment'; target = 'existing-required-decision';
      authorityText = 'Existing rule: resolve the prior required choice while preserving unrelated rules.\n';
    }
    const bHead = commitOn(f, `cli-${kind}-b`, { 'docs/authority.md': authorityText });
    const record = { version: 1, kind: kind === 'addition' ? 'preview-addition-record' : 'preview-amendment-record',
      baseSha: f.base, bSha: bHead, triggerReceiptSha256: sha(previewReceiptBytes(trigger)), target,
      purpose: `Synthetic ${kind} CLI composition.` };
    const bRequest = JSON.parse(run(f.root, 'prepare', { spec: spec(f, mode, bHead, trigger, record) }).toString());
    const checks = { addressesTrigger: true, withinSelectedScope: true, authorityOnly: true,
      noUnrelatedChanges: true, coherentResult: true, noUnsupportedClaims: true,
      predecessorAuthorized: true, triggerMissingDecision: kind === 'addition',
      triggerExistingDecision: kind === 'owner-amendment', targetDecisionOnly: true };
    const responseJson = JSON.stringify({ semanticDecision: decision('ELIGIBLE'), checks });
    const receipt = JSON.parse(run(f.root, 'complete', { request: bRequest, responseJson }).toString());
    assert.equal(receipt.eligibility, 'ELIGIBLE', `${kind} completes through the CLI`);
    assert.equal(receipt.assurance.ownerAuthentication, 'UNVERIFIED');
    const receiptText = JSON.stringify(receipt);
    git(f.root, 'switch', 'main');
    git(f.root, 'merge', '--no-ff', '-m', `Synthetic ${kind} integration\n\nAGK-Preview-Receipt-v1: sha256:${sha(Buffer.from(receiptText))}`, bHead);
    const integrationSha = git(f.root, 'rev-parse', 'HEAD');
    const finalRecord = JSON.parse(run(f.root, 'finalize', { receiptJson: receiptText, integrationSha }).toString());
    assert.equal(finalRecord.adoption, 'OBSERVED', `${kind} merge placement finalizes through the CLI`);
    const freshHead = commitOn(f, `cli-${kind}-fresh`, { 'app.txt': `fresh ${kind} successor\n` }, finalRecord.targetSha);
    const fresh = JSON.parse(run(f.root, 'fresh', { finalRecord, aHeadSha: freshHead }).toString());
    assert.equal(fresh.spec.mode, 'review', `${kind} final record prepares a fresh review`);
  }
});

test('CLI child composition supports the selected initial legacy migration and fresh review', async t => {
  const f = fixture(t);
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const callerPath = '.github/workflows/architecture-gate.yml';
  git(f.root, 'switch', '-c', 'cli-migration-predecessor');
  put(f.root, f.selection.eligibilitySchemaPath, { type: 'object', additionalProperties: false,
    required: ['decision', 'summary', 'authorityIds', 'valid'], properties: {
      decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] }, summary: { type: 'string' },
      authorityIds: { type: 'array', minItems: 2, items: { enum: ['contract', 'governance'] } }, valid: { type: 'boolean' },
    } });
  git(f.root, 'add', f.selection.eligibilitySchemaPath); git(f.root, 'commit', '-m', 'Select compatible migration B schema');
  f.base = git(f.root, 'rev-parse', 'HEAD');
  git(f.root, 'switch', 'main'); git(f.root, 'merge', '--ff-only', f.base);
  git(f.root, 'switch', '-c', 'cli-migration-candidate');
  put(f.root, policyPath, { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimits: { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536,
      maxTotalBytes: 262144, maxPromptBytes: 524288 },
  } } });
  put(f.root, callerPath, 'uses: fixture/reviewer@new-preview-pin\n');
  git(f.root, 'add', policyPath, callerPath); git(f.root, 'commit', '-m', 'Synthetic selected initial migration');
  const head = git(f.root, 'rev-parse', 'HEAD');
  const migration = { version: 1, repository: 'fixture/example', targetBranch: 'main', baseSha: f.base,
    headSha: head, mode: 'migration', selectionPath, trigger: null, record: null };
  const request = JSON.parse(run(f.root, 'prepare', { spec: migration }).toString());
  const receiptText = run(f.root, 'complete', { request,
    responseJson: JSON.stringify(ordinary(decision('PASS'))) }).toString('utf8');
  const receipt = JSON.parse(receiptText);
  assert.equal(receipt.eligibility, 'ELIGIBLE');
  git(f.root, 'switch', 'main');
  git(f.root, 'merge', '--no-ff', '-m', `Synthetic migration integration\n\nAGK-Preview-Receipt-v1: sha256:${sha(Buffer.from(receiptText))}`, head);
  const integrationSha = git(f.root, 'rev-parse', 'HEAD');
  const finalRecord = JSON.parse(run(f.root, 'finalize', { receiptJson: receiptText, integrationSha }).toString());
  assert.equal(finalRecord.adoption, 'OBSERVED');
  const aHead = commitOn(f, 'cli-migration-fresh-a', { 'app.txt': 'fresh after migration\n' }, finalRecord.targetSha);
  const fresh = JSON.parse(run(f.root, 'fresh', { finalRecord, aHeadSha: aHead }).toString());
  assert.equal(fresh.spec.baseSha, finalRecord.targetSha);
  assert.equal(fresh.spec.mode, 'review');
});

test('CLI accepts the core depth-64 response while reserving wrapper depth for receipt and fresh envelopes', t => {
  const f = fixture(t);
  git(f.root, 'switch', '-c', 'cli-depth64-predecessor');
  const schema = JSON.parse(readFileSync(join(f.root, f.selection.schemaPath), 'utf8'));
  schema.$defs = { deep: { type: 'object', additionalProperties: false,
    properties: { child: { $ref: '#/$defs/deep' } } } };
  schema.properties.nested = { $ref: '#/$defs/deep' };
  put(f.root, f.selection.schemaPath, schema);
  git(f.root, 'add', f.selection.schemaPath); git(f.root, 'commit', '-m', 'Select bounded recursive response schema');
  f.base = git(f.root, 'rev-parse', 'HEAD');
  const head = commitOn(f, 'cli-depth64-a', { 'app.txt': 'depth boundary\n' }, f.base);
  const request = JSON.parse(run(f.root, 'prepare', { spec: spec(f, 'review', head) }).toString());
  const semanticDecision = decision('PASS');
  let nested = {};
  for (let index = 0; index < 62; index++) nested = { child: nested };
  semanticDecision.nested = nested;
  const responseJson = JSON.stringify(ordinary(semanticDecision));
  assert.doesNotThrow(() => JSON.parse(responseJson));
  const receipt = JSON.parse(run(f.root, 'complete', { request, responseJson }).toString());
  assert.equal(receipt.decision.decision, 'PASS');
  assert.equal(receipt.response.semanticDecision.nested.child.child.child !== undefined, true);
});
