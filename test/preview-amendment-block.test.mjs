import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PREVIEW_PROFILE, preparePreviewLifecycle, completePreviewLifecycle, validatePreviewReceipt,
  observePreviewLifecycle, prepareFreshPreviewReview, previewReceiptBytes } from '../src/preview-lifecycle.mjs';

const files = ['docs/architecture.md', 'docs/governance.md'];
const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, file, value) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const sha = value => createHash('sha256').update(value).digest('hex');
function fixture(t, triggerProfile = 'completed-block-v1') {
  const root = mkdtempSync(join(tmpdir(), 'preview-block-only-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Synthetic preview'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const selection = { version: 1, profile: PREVIEW_PROFILE, repository: 'fixture/example', targetBranch: 'main',
    governancePath: files[1], authorization: 'Synthetic owner-selected unverified BLOCK preview',
    policyPath: '.codex/gatekeeper/ci-policy.json', promptPath: '.codex/gatekeeper/prompt.md',
    schemaPath: '.codex/gatekeeper/decision.schema.json', validationPath: '.codex/gatekeeper/rules.json',
    eligibilitySchemaPath: '.codex/gatekeeper/eligibility.schema.json', eligibilityValidationPath: '.codex/gatekeeper/eligibility-rules.json',
    amendmentTriggerProfile: triggerProfile, callerPath: '.github/workflows/architecture-gate.yml',
    authorityPaths: [files[0]], migrationPaths: ['.codex/gatekeeper/ci-policy.json'], maxPromptBytes: 524288 };
  put(root, files[0], 'Existing required decision: current rule.\n'); put(root, files[1], 'Owner selected the unverified preview procedure.\n'); put(root, 'app.txt', 'original\n');
  put(root, selection.promptPath, 'Review the proposed change against all predecessor authority.\n');
  put(root, selection.callerPath, 'uses: fixture/reviewer@fixed\n');
  const decisionSchema = { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles', 'valid'], properties: {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' },
    authorityFiles: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } } };
  const eligibilitySchema = structuredClone(decisionSchema); eligibilitySchema.properties.decision.enum = ['ELIGIBLE', 'INELIGIBLE'];
  put(root, selection.schemaPath, decisionSchema); put(root, selection.eligibilitySchemaPath, eligibilitySchema);
  put(root, '.codex/gatekeeper/rules.json', { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' }, require: { path: '/valid', equals: true }, message: 'synthetic ordinary validator' }] });
  put(root, selection.eligibilityValidationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'synthetic B validator' }] });
  put(root, selection.policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6-luna', reasoningEffort: 'low',
    authorityFiles: files, promptPath: selection.promptPath, schemaPath: selection.schemaPath, validationPath: selection.validationPath } } });
  put(root, selectionPath, selection);
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic selected predecessor');
  const base = git(root, 'rev-parse', 'HEAD'); return { root, base, selection };
}
const spec = (f, mode, headSha, trigger = null, record = null, baseSha = f.base) => ({ version: 1, repository: 'fixture/example', targetBranch: 'main', baseSha, headSha, mode, selectionPath, trigger, record });
function commitOn(f, name, changes, base = f.base) {
  git(f.root, 'switch', '-c', name, base);
  for (const [file, value] of Object.entries(changes)) put(f.root, file, value);
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', `Synthetic ${name}`); return git(f.root, 'rev-parse', 'HEAD');
}
const ordinary = semanticDecision => ({ semanticDecision, checks: { predecessorAuthorized: true } });
const fullDecision = (decision, summary) => ({ decision, summary, authorityFiles: files, valid: true });
async function makeTrigger(f, result = 'BLOCK') {
  const aHead = commitOn(f, `a-${result.toLowerCase()}`, { 'app.txt': 'Synthetic proposed A\n' });
  const request = await preparePreviewLifecycle(spec(f, 'review', aHead), f.root);
  const receipt = await completePreviewLifecycle(request, ordinary(fullDecision(result, 'Synthetic model-free fixture response')), f.root);
  return { aHead, request, receipt };
}
function recordFor(f, bHead, trigger) {
  return { version: 1, kind: 'preview-amendment-record', baseSha: f.base, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(trigger)), target: 'existing-required-decision', purpose: 'synthetic BLOCK resolution' };
}
async function makeB(f, trigger, { content = 'Existing required decision: clarified rule.\n', target = 'existing-required-decision' } = {}) {
  const bHead = commitOn(f, 'b-amendment', { [files[0]]: content });
  const record = { ...recordFor(f, bHead, trigger), target };
  const request = await preparePreviewLifecycle(spec(f, 'amendment', bHead, trigger, record), f.root);
  return { bHead, record, request };
}
const eligibleResponse = (result = 'ELIGIBLE', targetDecisionOnly = true) => ({
  semanticDecision: fullDecision(result, 'Synthetic deterministic eligibility response; not a model execution claim.'),
  checks: { addressesTrigger: true, withinSelectedScope: true, authorityOnly: true, noUnrelatedChanges: true,
    coherentResult: true, noUnsupportedClaims: true, predecessorAuthorized: true,
    triggerMissingDecision: false, triggerExistingDecision: false, targetDecisionOnly },
});
function integrate(f, bHead, receipt, trailerOverride) {
  const receiptHash = sha(previewReceiptBytes(receipt)); const trailer = trailerOverride ?? `sha256:${receiptHash}`;
  git(f.root, 'switch', 'main'); git(f.root, 'merge', '--no-ff', '-m', `Synthetic B integration\n\nAGK-Preview-Receipt-v1: ${trailer}`, bHead);
  return git(f.root, 'rev-parse', 'HEAD');
}

test('BLOCK-only amendment completes exact A→B→integration/readback→fresh A synthetic cycle', async t => {
  const f = fixture(t); const a = await makeTrigger(f, 'BLOCK');
  const b = await makeB(f, a.receipt);
  assert.match(b.request.prompt, /BLOCK-trigger amendment/);
  assert.match(b.request.prompt, /triggerMissingDecision/);
  assert.equal(b.request.schema.properties.checks.required.includes('targetDecisionOnly'), true);
  const receipt = await completePreviewLifecycle(b.request, eligibleResponse(), f.root);
  assert.equal(receipt.eligibility, 'ELIGIBLE');
  const integration = integrate(f, b.bHead, receipt);
  const final = await observePreviewLifecycle(receipt, integration, f.root, previewReceiptBytes(receipt));
  assert.equal(final.adoption, 'OBSERVED'); assert.equal(final.canonical, 'VERIFIED');
  assert.equal(final.assurance.custody, 'UNVERIFIED');
  assert.deepEqual(git(f.root, 'show', '-s', '--format=%P', integration).split(' '), [f.base, b.bHead]);
  assert.equal(git(f.root, 'rev-parse', `${integration}^{tree}`), git(f.root, 'rev-parse', `${b.bHead}^{tree}`));
  const freshHead = commitOn(f, 'fresh-a', { 'app.txt': 'Synthetic successor A\n' }, final.targetSha);
  const fresh = await prepareFreshPreviewReview(final, freshHead, f.root);
  assert.equal(fresh.spec.baseSha, final.targetSha);
  const freshReceipt = await completePreviewLifecycle(fresh, ordinary(fullDecision('PASS', 'Synthetic successor A response')), f.root);
  assert.equal(freshReceipt.decision.decision, 'PASS');
});

test('only a completed BLOCK trigger and predecessor-selected BLOCK profile can prepare B', async t => {
  const f = fixture(t); const pass = await makeTrigger(f, 'PASS'); const bHead = commitOn(f, 'b-after-pass', { [files[0]]: 'Changed\n' });
  await assert.rejects(preparePreviewLifecycle(spec(f, 'amendment', bHead, pass.receipt, recordFor(f, bHead, pass.receipt)), f.root), /completed BLOCK/);
  const ownerFixture = fixture(t, 'completed-owner-decision-v1'); const owner = await makeTrigger(ownerFixture, 'OWNER_DECISION');
  const ownerB = commitOn(ownerFixture, 'owner-trigger-b', { [files[0]]: 'Changed\n' });
  await assert.rejects(preparePreviewLifecycle(spec(ownerFixture, 'amendment', ownerB, owner.receipt, recordFor(ownerFixture, ownerB, owner.receipt)), ownerFixture.root), /completed-block-v1/);
  for (const mode of ['addition', 'migration']) await assert.rejects(preparePreviewLifecycle(spec(f, mode, bHead, {}, {}), f.root), /unsupported spec/);
});

test('INELIGIBLE B is recorded but cannot be observed; wrong record and stale runtime fail closed', async t => {
  const f = fixture(t); const a = await makeTrigger(f, 'BLOCK'); const b = await makeB(f, a.receipt);
  const wrongRecordRequest = structuredClone(b.request); wrongRecordRequest.spec.record.target = 'different-decision';
  await assert.rejects(completePreviewLifecycle(wrongRecordRequest, eligibleResponse(), f.root), /record integrity mismatch|request differs/);
  const staleRuntime = structuredClone(b.request); staleRuntime.runtime.files['preview-lifecycle.mjs'] = '0'.repeat(64);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
  const unsigned = { ...staleRuntime }; delete unsigned.integritySha256;
  staleRuntime.integritySha256 = sha(Buffer.from(JSON.stringify(canonical(unsigned))));
  await assert.rejects(completePreviewLifecycle(staleRuntime, eligibleResponse(), f.root), /request differs from immutable predecessor inputs/);
  const receipt = await completePreviewLifecycle(b.request, eligibleResponse('INELIGIBLE', false), f.root);
  await assert.rejects(observePreviewLifecycle(receipt, b.bHead, f.root), /not an eligible BLOCK amendment/);
});

test('receipt trailer, merge parent order/tree and target readback are exact', async t => {
  const f = fixture(t); const a = await makeTrigger(f, 'BLOCK'); const b = await makeB(f, a.receipt);
  const receipt = await completePreviewLifecycle(b.request, eligibleResponse(), f.root);
  const wrongTrailerMerge = integrate(f, b.bHead, receipt, `sha256:${'0'.repeat(64)}`);
  await assert.rejects(observePreviewLifecycle(receipt, wrongTrailerMerge, f.root), /trailer/);
  git(f.root, 'switch', '-c', 'reset-main-to-base', f.base);
  git(f.root, 'branch', '-f', 'main', f.base);
  const good = integrate(f, b.bHead, receipt);
  const raw = Buffer.from(previewReceiptBytes(receipt)); raw[5] ^= 1;
  await assert.rejects(observePreviewLifecycle(receipt, good, f.root, raw), /raw receipt bytes differ/);
  const changed = commitOn(f, 'changed-readback', { [files[0]]: 'Post-integration alteration\n' }, good);
  git(f.root, 'branch', '-f', 'main', changed);
  await assert.rejects(observePreviewLifecycle(receipt, good, f.root), /target does not contain|placement differs/);
});
