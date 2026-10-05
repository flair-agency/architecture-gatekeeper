import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PREVIEW_PROFILE, preparePreviewLifecycle, completePreviewLifecycle,
  observePreviewLifecycle, prepareFreshPreviewReview, previewReceiptBytes } from '../src/preview-lifecycle.mjs';

const authority = 'docs/architecture.md', governance = 'docs/governance.md';
const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, file, value) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const sha = value => createHash('sha256').update(value).digest('hex');
let next = 0;
function fixture(t, triggerProfile = 'completed-owner-decision-v1') {
  const root = mkdtempSync(join(tmpdir(), 'preview-owner-amendment-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Synthetic preview'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const selection = { version: 1, profile: PREVIEW_PROFILE, repository: 'fixture/example', targetBranch: 'main',
    governancePath: governance, authorization: 'Synthetic owner-selected unverified existing-decision amendment preview',
    policyPath: '.codex/gatekeeper/ci-policy.json', promptPath: '.codex/gatekeeper/prompt.md',
    schemaPath: '.codex/gatekeeper/decision.schema.json', validationPath: '.codex/gatekeeper/rules.json',
    eligibilitySchemaPath: '.codex/gatekeeper/eligibility.schema.json', eligibilityValidationPath: '.codex/gatekeeper/eligibility-rules.json',
    amendmentTriggerProfile: triggerProfile, callerPath: '.github/workflows/architecture-gate.yml', authorityPaths: [authority],
    migrationPaths: ['.codex/gatekeeper/ci-policy.json'], maxPromptBytes: 524288 };
  const before = 'Existing decision existing-rule-1: original rule.\n';
  put(root, authority, before); put(root, governance, 'The selected preview may resolve an owner decision to change an existing rule.\n');
  put(root, 'app.txt', 'original\n'); put(root, selection.promptPath, 'Review the proposed change against all predecessor authority.\n');
  put(root, selection.callerPath, 'uses: fixture/reviewer@fixed\n');
  const ordinarySchema = { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles', 'valid'], properties: {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' }, ownerDecisionId: { type: 'string' },
    authorityFiles: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } } };
  const eligibilitySchema = structuredClone(ordinarySchema); eligibilitySchema.properties.decision.enum = ['ELIGIBLE', 'INELIGIBLE'];
  put(root, selection.schemaPath, ordinarySchema); put(root, selection.eligibilitySchemaPath, eligibilitySchema);
  put(root, '.codex/gatekeeper/rules.json', { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' }, require: { path: '/valid', equals: true }, message: 'ordinary validator' }] });
  put(root, selection.eligibilityValidationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'owner amendment validator' }] });
  put(root, selection.policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6-luna', reasoningEffort: 'low',
    authorityFiles: [authority, governance], promptPath: selection.promptPath, schemaPath: selection.schemaPath, validationPath: selection.validationPath } } });
  put(root, selectionPath, selection); git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic selected predecessor');
  return { root, before, base: git(root, 'rev-parse', 'HEAD'), selection };
}
const spec = (f, mode, headSha, trigger = null, record = null) => ({ version: 1, repository: 'fixture/example', targetBranch: 'main', baseSha: f.base, headSha, mode, selectionPath, trigger, record });
function commit(f, changes, base = f.base) {
  git(f.root, 'switch', '-c', `synthetic-owner-${++next}`, base);
  for (const [file, value] of Object.entries(changes)) put(f.root, file, value);
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Synthetic owner amendment'); return git(f.root, 'rev-parse', 'HEAD');
}
const decision = (kind, summary) => ({ decision: kind, summary, authorityFiles: [authority, governance], valid: true });
const ordinaryResponse = semanticDecision => ({ semanticDecision, checks: { predecessorAuthorized: true } });
async function trigger(f, kind = 'OWNER_DECISION', summary = 'The owner chose to change existing decision existing-rule-1; the old rule is superseded.') {
  const a = commit(f, { 'app.txt': 'Synthetic proposed A\n' });
  const request = await preparePreviewLifecycle(spec(f, 'review', a), f.root);
  const receipt = await completePreviewLifecycle(request, ordinaryResponse(decision(kind, summary)), f.root);
  return { a, receipt };
}
async function prepareOwnerAmendment(f, a, b, target = 'existing-rule-1') {
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: f.base, bSha: b,
    triggerReceiptSha256: sha(previewReceiptBytes(a.receipt)), target, purpose: 'Synthetic resolution of existing owner choice' };
  const request = await preparePreviewLifecycle(spec(f, 'amendment', b, a.receipt, record), f.root);
  return { record, request };
}
const response = (kind = 'ELIGIBLE', overrides = {}) => ({ semanticDecision: decision(kind, 'Synthetic deterministic B eligibility response; no model execution claim.'),
  checks: { addressesTrigger: true, withinSelectedScope: true, authorityOnly: true, noUnrelatedChanges: true, coherentResult: true,
    noUnsupportedClaims: true, predecessorAuthorized: true, triggerMissingDecision: false, triggerExistingDecision: true, targetDecisionOnly: true, ...overrides } });
function integrate(f, b, receipt) {
  const receiptHash = sha(previewReceiptBytes(receipt)); git(f.root, 'switch', 'main');
  git(f.root, 'merge', '--no-ff', '-m', `Synthetic owner amendment integration\n\nAGK-Preview-Receipt-v1: sha256:${receiptHash}`, b);
  return git(f.root, 'rev-parse', 'HEAD');
}

test('selected OWNER_DECISION existing-choice amendment completes and preserves fresh A cycle without requiring ownerDecisionId', async t => {
  const f = fixture(t); const a = await trigger(f); const b = commit(f, { [authority]: 'Existing decision existing-rule-1: amended rule resolving the prior owner choice.\n' });
  const { request } = await prepareOwnerAmendment(f, a, b);
  assert.equal(request.spec.mode, 'amendment'); assert.equal(request.selection.amendmentTriggerProfile, 'completed-owner-decision-v1');
  assert.match(request.prompt, /Classify the full bound completed OWNER_DECISION content/);
  assert.match(request.prompt, /Do not require an ownerDecisionId unless the predecessor-selected schema requires it/);
  assert.equal(JSON.parse(request.prompt.split('Bound task:\n')[1].split('\nReturn only')[0]).trigger.decision.ownerDecisionId, undefined);
  const receipt = await completePreviewLifecycle(request, response(), f.root); assert.equal(receipt.eligibility, 'ELIGIBLE');
  const integration = integrate(f, b, receipt); const final = await observePreviewLifecycle(receipt, integration, f.root);
  assert.equal(final.adoption, 'OBSERVED'); assert.equal(final.canonical, 'VERIFIED');
  assert.equal(final.assurance.custody, 'UNVERIFIED');
  const freshHead = commit(f, { 'app.txt': 'Synthetic fresh A after owner amendment.\n' }, final.targetSha);
  const fresh = await prepareFreshPreviewReview(final, freshHead, f.root); assert.equal(fresh.spec.baseSha, final.targetSha);
  const done = await completePreviewLifecycle(fresh, ordinaryResponse(decision('PASS', 'Synthetic fresh A.')), f.root);
  assert.equal(done.decision.decision, 'PASS');
});

test('owner amendment rejects wrong trigger profile/result, record target, mixed or unresolved B', async t => {
  const f = fixture(t); const a = await trigger(f); const b = commit(f, { [authority]: 'Existing decision existing-rule-1: changed rule.\n' });
  const { request, record } = await prepareOwnerAmendment(f, a, b);
  await assert.rejects(completePreviewLifecycle(request, response('ELIGIBLE', { triggerMissingDecision: true, triggerExistingDecision: false }), f.root), /OWNER_DECISION amendment semantic eligibility/);
  await assert.rejects(completePreviewLifecycle(request, response('ELIGIBLE', { targetDecisionOnly: false }), f.root), /OWNER_DECISION amendment semantic eligibility/);
  const unresolved = await completePreviewLifecycle(request, response('INELIGIBLE', { targetDecisionOnly: false }), f.root);
  assert.equal(unresolved.eligibility, 'INELIGIBLE'); await assert.rejects(observePreviewLifecycle(unresolved, b, f.root), /eligible selected B procedure/);
  const ineligible = await completePreviewLifecycle(request, response('INELIGIBLE', { triggerMissingDecision: true, triggerExistingDecision: false, targetDecisionOnly: false }), f.root);
  assert.equal(ineligible.eligibility, 'INELIGIBLE'); await assert.rejects(observePreviewLifecycle(ineligible, b, f.root), /eligible selected B procedure/);
  const wrongRecord = { ...record, target: 'different-existing-rule' };
  const wrongTarget = await preparePreviewLifecycle(spec(f, 'amendment', b, a.receipt, wrongRecord), f.root);
  await assert.rejects(completePreviewLifecycle(wrongTarget, response('ELIGIBLE', { targetDecisionOnly: false }), f.root), /OWNER_DECISION amendment semantic eligibility/);
  const mixed = commit(f, { [authority]: 'Existing decision existing-rule-1: changed rule.\n', 'app.txt': 'unrelated implementation edit\n' });
  await assert.rejects(prepareOwnerAmendment(f, a, mixed), /authority-only scope/);
  const block = await trigger(f, 'BLOCK', 'A is blocked; no owner-selected existing-choice trigger.');
  await assert.rejects(prepareOwnerAmendment(f, block, b), /completed OWNER_DECISION trigger/);
  const blockProfile = fixture(t, 'completed-block-v1'); const blockA = await trigger(blockProfile, 'OWNER_DECISION');
  const blockB = commit(blockProfile, { [authority]: 'Existing decision existing-rule-1: changed rule.\n' });
  await assert.rejects(prepareOwnerAmendment(blockProfile, blockA, blockB), /completed BLOCK trigger/);
  const mixedDecision = await trigger(f, 'OWNER_DECISION', 'The owner requests both a missing decision and an existing rule change.');
  const mixedB = commit(f, { [authority]: 'Changed existing rule and added missing decision.\n' });
  const mixedRequest = await prepareOwnerAmendment(f, mixedDecision, mixedB);
  const rejected = await completePreviewLifecycle(mixedRequest.request, response('INELIGIBLE', { triggerMissingDecision: true, triggerExistingDecision: false, targetDecisionOnly: false }), f.root);
  assert.equal(rejected.eligibility, 'INELIGIBLE'); await assert.rejects(observePreviewLifecycle(rejected, mixedB, f.root), /eligible selected B procedure/);
});

test('installed CLI executes synthetic OWNER_DECISION amendment through observe and fresh review', { skip: !process.env.PREVIEW_LIFECYCLE_SMOKE_CLI }, async t => {
  const f = fixture(t); const parent = mkdtempSync(join(tmpdir(), 'preview-owner-amendment-cli-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const cli = process.env.PREVIEW_LIFECYCLE_SMOKE_CLI;
  const save = (name, value) => { const file = join(parent, name); writeFileSync(file, JSON.stringify(value)); return file; };
  const invoke = (...args) => {
    const result = spawnSync(cli, args, { cwd: f.root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  const aHead = commit(f, { 'app.txt': 'Installed synthetic A\n' });
  const aSpec = save('a-spec.json', spec(f, 'review', aHead)); const aReq = join(parent, 'a-request.json'); invoke('prepare', aSpec, aReq);
  const aResponse = save('a-response.json', ordinaryResponse(decision('OWNER_DECISION', 'Change existing-rule-1 under owner choice.')));
  const aReceiptPath = join(parent, 'a-receipt.json'); invoke('complete', aReq, aResponse, aReceiptPath);
  const aReceipt = JSON.parse(readFileSync(aReceiptPath, 'utf8'));
  const bHead = commit(f, { [authority]: 'Existing decision existing-rule-1: installed synthetic amendment.\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: f.base, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(aReceipt)), target: 'existing-rule-1', purpose: 'Installed synthetic amendment' };
  const bSpec = save('b-spec.json', spec(f, 'amendment', bHead, aReceipt, record)); const bReq = join(parent, 'b-request.json'); invoke('prepare', bSpec, bReq);
  const bReceiptPath = join(parent, 'b-receipt.json'); invoke('complete', bReq, save('b-response.json', response()), bReceiptPath);
  const bReceipt = JSON.parse(readFileSync(bReceiptPath, 'utf8')); const integration = integrate(f, bHead, bReceipt);
  const finalPath = join(parent, 'final.json'); invoke('observe', bReceiptPath, integration, finalPath);
  const final = JSON.parse(readFileSync(finalPath, 'utf8')); const freshHead = commit(f, { 'app.txt': 'Installed fresh A\n' }, final.targetSha);
  const freshReq = join(parent, 'fresh-request.json'); invoke('fresh-review', finalPath, freshHead, freshReq);
  assert.equal(JSON.parse(readFileSync(freshReq, 'utf8')).spec.baseSha, final.targetSha);
});
