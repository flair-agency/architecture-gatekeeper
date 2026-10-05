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
function fixture(t, triggerProfile = null) {
  const root = mkdtempSync(join(tmpdir(), 'preview-addition-only-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Synthetic preview'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const selection = { version: 1, profile: PREVIEW_PROFILE, repository: 'fixture/example', targetBranch: 'main',
    governancePath: governance, authorization: 'Synthetic owner-selected unverified addition preview',
    policyPath: '.codex/gatekeeper/ci-policy.json', promptPath: '.codex/gatekeeper/prompt.md',
    schemaPath: '.codex/gatekeeper/decision.schema.json', validationPath: '.codex/gatekeeper/rules.json',
    eligibilitySchemaPath: '.codex/gatekeeper/eligibility.schema.json', eligibilityValidationPath: '.codex/gatekeeper/eligibility-rules.json',
    callerPath: '.github/workflows/architecture-gate.yml', authorityPaths: [authority],
    migrationPaths: ['.codex/gatekeeper/ci-policy.json'], maxPromptBytes: 524288,
    ...(triggerProfile ? { amendmentTriggerProfile: triggerProfile } : {}) };
  const before = 'Existing rule: preserve exactly.\n';
  put(root, authority, before); put(root, governance, 'The selected owner preview procedure may add a missing decision.\n'); put(root, 'app.txt', 'original\n');
  put(root, selection.promptPath, 'Review the proposed change under all predecessor authority.\n'); put(root, selection.callerPath, 'uses: fixture/reviewer@fixed\n');
  const ordinarySchema = { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles', 'valid'], properties: {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' }, ownerDecisionId: { type: 'string' },
    authorityFiles: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } } };
  const eligibilitySchema = structuredClone(ordinarySchema); eligibilitySchema.properties.decision.enum = ['ELIGIBLE', 'INELIGIBLE'];
  put(root, selection.schemaPath, ordinarySchema); put(root, selection.eligibilitySchemaPath, eligibilitySchema);
  put(root, '.codex/gatekeeper/rules.json', { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' }, require: { path: '/valid', equals: true }, message: 'ordinary validator' }] });
  put(root, selection.eligibilityValidationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'addition validator' }] });
  put(root, selection.policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6-luna', reasoningEffort: 'low',
    authorityFiles: [authority, governance], promptPath: selection.promptPath, schemaPath: selection.schemaPath, validationPath: selection.validationPath } } });
  put(root, selectionPath, selection); git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic selected predecessor');
  const base = git(root, 'rev-parse', 'HEAD'); return { root, base, before, selection };
}
const spec = (f, mode, headSha, trigger = null, record = null, baseSha = f.base) => ({ version: 1, repository: 'fixture/example', targetBranch: 'main', baseSha, headSha, mode, selectionPath, trigger, record });
function commit(f, changes, base = f.base) {
  git(f.root, 'switch', '-c', `synthetic-${++next}`, base);
  for (const [file, value] of Object.entries(changes)) put(f.root, file, value);
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Synthetic preview change'); return git(f.root, 'rev-parse', 'HEAD');
}
const decision = (kind, summary, ownerDecisionId = undefined) => ({ decision: kind, summary, authorityFiles: [authority, governance], valid: true, ...(ownerDecisionId ? { ownerDecisionId } : {}) });
const ordinaryResponse = d => ({ semanticDecision: d, checks: { predecessorAuthorized: true } });
async function trigger(f, ownerId = 'missing-choice-1') {
  const a = commit(f, { 'app.txt': 'Synthetic proposed A\n' });
  const request = await preparePreviewLifecycle(spec(f, 'review', a), f.root);
  const receipt = await completePreviewLifecycle(request, ordinaryResponse(decision('OWNER_DECISION', 'A required decision is missing.', ownerId)), f.root);
  return { a, receipt };
}
async function additionRequest(f, a, b, target = 'missing-choice-1') {
  const record = { version: 1, kind: 'preview-addition-record', baseSha: f.base, bSha: b,
    triggerReceiptSha256: sha(previewReceiptBytes(a.receipt)), target, purpose: 'Synthetic missing-decision resolution' };
  const request = await preparePreviewLifecycle(spec(f, 'addition', b, a.receipt, record), f.root);
  return { request, record };
}
const additionResponse = (kind = 'ELIGIBLE', overrides = {}) => ({ semanticDecision: decision(kind, 'Synthetic deterministic eligibility response; no model execution claim.'),
  checks: { addressesTrigger: true, withinSelectedScope: true, authorityOnly: true, noUnrelatedChanges: true, coherentResult: true,
    noUnsupportedClaims: true, predecessorAuthorized: true, triggerMissingDecision: true, triggerExistingDecision: false, targetDecisionOnly: true, ...overrides } });
function integrate(f, b, receipt) {
  const hash = sha(previewReceiptBytes(receipt)); git(f.root, 'switch', 'main');
  git(f.root, 'merge', '--no-ff', '-m', `Synthetic B integration\n\nAGK-Preview-Receipt-v1: sha256:${hash}`, b);
  return git(f.root, 'rev-parse', 'HEAD');
}

test('OWNER_DECISION missing-only addition completes exact A→B→readback→fresh A synthetic cycle', async t => {
  const f = fixture(t); const a = await trigger(f); const b = commit(f, { [authority]: `${f.before}New decision: missing-choice-1 is now recorded.\n` });
  const { request } = await additionRequest(f, a, b);
  assert.equal(request.spec.mode, 'addition'); assert.match(request.prompt, /missing ownerDecisionId/);
  assert.match(request.prompt, /triggerExistingDecision false/);
  const task = JSON.parse(request.prompt.split('Bound task:\n')[1].split('\nReturn only')[0]);
  assert.equal(task.trigger.decision.ownerDecisionId, 'missing-choice-1');
  const receipt = await completePreviewLifecycle(request, additionResponse(), f.root);
  assert.equal(receipt.eligibility, 'ELIGIBLE');
  const integration = integrate(f, b, receipt); const final = await observePreviewLifecycle(receipt, integration, f.root);
  assert.equal(final.adoption, 'OBSERVED'); assert.equal(final.canonical, 'VERIFIED');
  assert.equal(final.assurance.custody, 'UNVERIFIED');
  const freshHead = commit(f, { 'app.txt': 'Synthetic successor A\n' }, final.targetSha);
  const fresh = await prepareFreshPreviewReview(final, freshHead, f.root);
  assert.equal(fresh.spec.baseSha, final.targetSha);
  const done = await completePreviewLifecycle(fresh, ordinaryResponse(decision('PASS', 'Synthetic fresh A response.')), f.root);
  assert.equal(done.decision.decision, 'PASS');
});

test('addition rejects wrong trigger, ownerDecisionId, replacement or unrelated mixed edits', async t => {
  const f = fixture(t); const a = await trigger(f); const goodText = `${f.before}Missing choice added.\n`;
  const changed = commit(f, { [authority]: goodText }); const good = await additionRequest(f, a, changed);
  await assert.rejects(preparePreviewLifecycle({ ...good.request.spec, record: { ...good.record, target: 'different-id' } }, f.root), /ownerDecisionId/);
  await assert.rejects(completePreviewLifecycle(good.request, additionResponse('ELIGIBLE', { triggerExistingDecision: true }), f.root), /addition semantic eligibility/);
  await assert.rejects(completePreviewLifecycle(good.request, additionResponse('ELIGIBLE', { triggerMissingDecision: false }), f.root), /addition semantic eligibility/);
  const replacement = commit(f, { [authority]: 'Replaced existing rule and added a choice.\n' });
  await assert.rejects(additionRequest(f, a, replacement), /append to existing authority/);
  const mixed = commit(f, { [authority]: goodText, 'app.txt': 'Unrelated implementation change\n' });
  await assert.rejects(additionRequest(f, a, mixed), /authority-only scope/);
  const passHead = commit(f, { 'app.txt': 'A from PASS\n' });
  const passRequest = await preparePreviewLifecycle(spec(f, 'review', passHead), f.root);
  const pass = await completePreviewLifecycle(passRequest, ordinaryResponse(decision('PASS', 'No missing decision.')), f.root);
  await assert.rejects(preparePreviewLifecycle(spec(f, 'addition', changed, pass, good.record), f.root), /completed OWNER_DECISION/);
  const noIdAHead = commit(f, { 'app.txt': 'A without ID\n' });
  const noIdReq = await preparePreviewLifecycle(spec(f, 'review', noIdAHead), f.root);
  const noIdReceipt = await completePreviewLifecycle(noIdReq, ordinaryResponse(decision('OWNER_DECISION', 'Missing but unbound id.')), f.root);
  await assert.rejects(preparePreviewLifecycle(spec(f, 'addition', changed, noIdReceipt, good.record), f.root), /exact ownerDecisionId/);
});

test('installed CLI executes synthetic addition through observe and fresh review', { skip: !process.env.PREVIEW_LIFECYCLE_SMOKE_CLI }, async t => {
  const f = fixture(t); const parent = mkdtempSync(join(tmpdir(), 'preview-addition-cli-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const cli = process.env.PREVIEW_LIFECYCLE_SMOKE_CLI;
  const save = (name, value) => { const file = join(parent, name); writeFileSync(file, JSON.stringify(value)); return file; };
  const invoke = (...args) => {
    const result = spawnSync(cli, args, { cwd: f.root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  const aHead = commit(f, { 'app.txt': 'Installed synthetic A\n' });
  const aSpec = save('a-spec.json', spec(f, 'review', aHead)); const aReq = join(parent, 'a-request.json');
  invoke('prepare', aSpec, aReq);
  const aRequest = JSON.parse(readFileSync(aReq, 'utf8'));
  const aResponse = save('a-response.json', ordinaryResponse(decision('OWNER_DECISION', 'Missing decision.', 'missing-choice-1')));
  const aReceiptPath = join(parent, 'a-receipt.json'); invoke('complete', aReq, aResponse, aReceiptPath);
  const aReceipt = JSON.parse(readFileSync(aReceiptPath, 'utf8'));
  const bHead = commit(f, { [authority]: `${f.before}Installed synthetic addition.\n` });
  const record = { version: 1, kind: 'preview-addition-record', baseSha: f.base, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(aReceipt)), target: 'missing-choice-1', purpose: 'Installed synthetic preview' };
  const bSpec = save('b-spec.json', spec(f, 'addition', bHead, aReceipt, record)); const bReq = join(parent, 'b-request.json');
  invoke('prepare', bSpec, bReq);
  const bResponse = save('b-response.json', additionResponse()); const bReceiptPath = join(parent, 'b-receipt.json');
  invoke('complete', bReq, bResponse, bReceiptPath); const bReceipt = JSON.parse(readFileSync(bReceiptPath, 'utf8'));
  const integration = integrate(f, bHead, bReceipt); const finalPath = join(parent, 'final.json');
  invoke('observe', bReceiptPath, integration, finalPath);
  const final = JSON.parse(readFileSync(finalPath, 'utf8')); const freshHead = commit(f, { 'app.txt': 'Installed fresh A\n' }, final.targetSha);
  const freshReq = join(parent, 'fresh-request.json'); invoke('fresh-review', finalPath, freshHead, freshReq);
  assert.equal(JSON.parse(readFileSync(freshReq, 'utf8')).spec.baseSha, final.targetSha);
  assert.equal(aRequest.spec.mode, 'review');
});
