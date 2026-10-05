import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PREVIEW_PROFILE, preparePreviewLifecycle, completePreviewLifecycle,
  observePreviewLifecycle, prepareFreshPreviewReview, previewReceiptBytes } from '@flair-agency/architecture-gatekeeper/preview-lifecycle';

const authority = ['docs/architecture.md', 'docs/governance.md'];
const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
const policyPath = '.codex/gatekeeper/ci-policy.json';
const callerPath = '.github/workflows/architecture-gate.yml';
const manifestPath = '.codex/gatekeeper/authorities.json';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, file, value) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const sha = value => createHash('sha256').update(value).digest('hex');
let next = 0;
function fixture(t, { preexistingSelection = false, schemaAllowsSuccessorIds = true, withTextconv = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'preview-initial-migration-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  let textconvMarker;
  if (withTextconv) {
    const support = mkdtempSync(join(tmpdir(), 'preview-initial-migration-textconv-'));
    t.after(() => rmSync(support, { recursive: true, force: true }));
    textconvMarker = join(support, 'invoked');
    const converter = join(support, 'converter.sh');
    writeFileSync(converter, `#!/bin/sh\nprintf 'textconv invoked\\n' >> ${JSON.stringify(textconvMarker)}\nprintf 'SPOOFED TEXTCONV DIFF\\n'\n`, { mode: 0o700 });
    textconvMarker = { marker: textconvMarker, converter };
  }
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Synthetic migration'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  if (withTextconv) git(root, 'config', 'diff.preview-hostile.textconv', JSON.stringify(textconvMarker.converter));
  const promptPath = '.codex/gatekeeper/prompt.md', schemaPath = '.codex/gatekeeper/schema.json', validationPath = '.codex/gatekeeper/rules.json';
  const selection = { version: 1, profile: PREVIEW_PROFILE, repository: 'fixture/example', targetBranch: 'main',
    governancePath: authority[1], authorization: 'Synthetic initial migration selection; owner authorization UNVERIFIED',
    policyPath, promptPath, schemaPath, validationPath,
    eligibilitySchemaPath: '.codex/gatekeeper/b-eligibility.schema.json', eligibilityValidationPath: '.codex/gatekeeper/b-rules.json',
    amendmentTriggerProfile: 'completed-block-v1', callerPath, authorityPaths: [authority[0]],
    migrationPaths: [selectionPath, policyPath, callerPath], maxPromptBytes: 524288 };
  const decisionProperties = {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' },
    authorityFiles: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } };
  if (schemaAllowsSuccessorIds) decisionProperties.authorityIds = { type: 'array', items: { type: 'string' } };
  const decisionSchema = { type: 'object', additionalProperties: false,
    required: ['decision', 'summary', 'authorityFiles', 'valid'], properties: decisionProperties };
  const bSchema = structuredClone(decisionSchema); bSchema.required = ['decision', 'summary', 'authorityIds', 'valid'];
  delete bSchema.properties.authorityFiles; bSchema.properties.decision.enum = ['ELIGIBLE', 'INELIGIBLE'];
  put(root, authority[0], 'Existing architecture decision.\n'); put(root, authority[1], 'Owner selected legacy v1 review procedure.\n'); put(root, 'app.txt', 'before\n');
  if (withTextconv) put(root, '.gitattributes', `${policyPath} diff=preview-hostile\n`);
  put(root, promptPath, 'Review the complete selected predecessor authority and migration changes.\n'); put(root, schemaPath, decisionSchema);
  put(root, validationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' }, require: { path: '/valid', equals: true }, message: 'old selected validator' }] });
  put(root, selection.eligibilitySchemaPath, bSchema); put(root, selection.eligibilityValidationPath,
    { version: 1, rules: [{ when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'successor B validator' }] });
  const authorities = authority.map((path, index) => ({ id: index ? 'governance' : 'architecture', repository: 'self', revision: 'authority-revision', path }));
  put(root, manifestPath, { version: 1, authorities }); put(root, '.codex/gatekeeper/omitted.json', { version: 1, authorities: [authorities[0]] });
  put(root, policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6-luna', reasoningEffort: 'low',
    authorityFiles: authority, promptPath, schemaPath, validationPath } } });
  put(root, callerPath, 'uses: fixture/reviewer@old-pin\n');
  if (preexistingSelection) put(root, selectionPath, selection);
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic old enforced v1 predecessor');
  return { root, selection, base: git(root, 'rev-parse', 'HEAD'), promptPath, schemaPath, validationPath, before: 'Existing architecture decision.\n', textconvMarker: textconvMarker?.marker };
}
function migratedPolicy(f, { version = 2, model = 'gpt-6-luna', manifest = manifestPath, trustedRoute = false } = {}) {
  const branch = { mode: 'enforced', model, reasoningEffort: 'low', authorityManifestPath: manifest,
    authorityLimits: { maxManifestBytes: 16384, maxMembers: 8, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 } };
  if (trustedRoute) branch.ownerAmendment = { version: 1, grade: 'G0' };
  return { version, default: { mode: 'local-only' }, branches: { main: branch } };
}
function migrationHead(f, { policy = migratedPolicy(f), selection = f.selection, caller = 'uses: fixture/reviewer@new-pin\n', extra = {} } = {}) {
  git(f.root, 'switch', '-c', `migration-candidate-${++next}`, f.base);
  put(f.root, selectionPath, selection); put(f.root, policyPath, policy); put(f.root, callerPath, caller);
  for (const [file, value] of Object.entries(extra)) put(f.root, file, value);
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Synthetic initial migration proposal'); return git(f.root, 'rev-parse', 'HEAD');
}
const migrationSpec = (f, headSha, baseSha = f.base) => ({ version: 1, repository: 'fixture/example', targetBranch: 'main', baseSha, headSha,
  mode: 'migration', selectionPath, trigger: null, record: null });
const decision = (kind, memberIds = false) => ({ decision: kind, summary: 'Synthetic predecessor-schema response; no model execution claim.',
  authorityFiles: authority, ...(memberIds ? { authorityIds: ['architecture', 'governance'] } : {}), valid: true });
const ordinary = (kind, memberIds = false) => ({ semanticDecision: decision(kind, memberIds), checks: { predecessorAuthorized: true } });
const B = () => ({ semanticDecision: { decision: 'ELIGIBLE', summary: 'Synthetic successor B classification; no model execution claim.', authorityFiles: authority, valid: true },
  checks: { addressesTrigger: true, withinSelectedScope: true, authorityOnly: true, noUnrelatedChanges: true,
    coherentResult: true, noUnsupportedClaims: true, predecessorAuthorized: true,
    triggerMissingDecision: false, triggerExistingDecision: false, targetDecisionOnly: true } });
function integrate(f, head, receipt, trailer) {
  const value = trailer ?? `sha256:${sha(previewReceiptBytes(receipt))}`; git(f.root, 'switch', 'main');
  git(f.root, 'merge', '--no-ff', '-m', `Synthetic M integration\n\nAGK-Preview-Receipt-v1: ${value}`, head);
  return git(f.root, 'rev-parse', 'HEAD');
}

test('initial compatible v1→v2 M passes old review, binds raw unchanged authority, then fresh successor B works', async t => {
  const f = fixture(t); const head = migrationHead(f);
  const request = await preparePreviewLifecycle(migrationSpec(f, head), f.root);
  assert.equal(request.policy.policyVersion, 1); assert.match(request.prompt, /only the predecessor's legacy v1 policy/);
  assert.equal(request.inputs.some(input => input.path === selectionPath), false);
  assert.equal(request.successorAuthoritySet.members.length, 2);
  assert.equal(request.successorAuthoritySet.manifest.path, manifestPath);
  assert.equal(request.successorInputs.length, 2);
  for (const member of request.successorAuthoritySet.members) {
    const predecessor = request.authoritySet.members.find(item => item.path === member.path);
    assert.equal(member.sha256, predecessor.sha256); assert.equal(member.byteLength, predecessor.byteLength);
  }
  const receipt = await completePreviewLifecycle(request, ordinary('PASS'), f.root);
  assert.equal(receipt.eligibility, 'ELIGIBLE');
  await assert.rejects(completePreviewLifecycle(request, ordinary('BLOCK'), f.root), /requires predecessor ordinary PASS/);
  const integration = integrate(f, head, receipt); const final = await observePreviewLifecycle(receipt, integration, f.root);
  assert.equal(final.adoption, 'OBSERVED'); assert.equal(final.canonical, 'VERIFIED');
  assert.equal(final.assurance.hostEnforcement, 'UNVERIFIED');
  const aHead = commit(f, final.targetSha, { 'app.txt': 'Successor A under migrated selector\n' });
  const fresh = await prepareFreshPreviewReview(final, aHead, f.root);
  assert.equal(fresh.spec.baseSha, final.targetSha); assert.equal(fresh.selection.profile, PREVIEW_PROFILE);
  const trigger = await completePreviewLifecycle(fresh, ordinary('BLOCK', true), f.root);
  const bHead = commit(f, final.targetSha, { [authority[0]]: 'Existing architecture decision amended under successor rules.\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: final.targetSha, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(trigger)), target: 'existing decision', purpose: 'Synthetic successor BLOCK resolution' };
  const bRequest = await preparePreviewLifecycle({ ...fresh.spec, baseSha: final.targetSha, headSha: bHead, mode: 'amendment', trigger, record }, f.root);
  const bResponse = B(); bResponse.semanticDecision = { decision: 'ELIGIBLE', summary: 'Synthetic successor B classification; no model execution claim.', authorityIds: ['architecture', 'governance'], valid: true };
  const bReceipt = await completePreviewLifecycle(bRequest, bResponse, f.root);
  assert.equal(bReceipt.eligibility, 'ELIGIBLE');
});
function commit(f, base, changes) {
  git(f.root, 'switch', '-c', `after-migration-${++next}`, base);
  for (const [file, value] of Object.entries(changes)) put(f.root, file, value);
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Synthetic post-migration change'); return git(f.root, 'rev-parse', 'HEAD');
}

test('initial migration fails closed on existing selector, changed reviewer settings, v3, omitted set, authority edits and trusted route', async t => {
  const existed = fixture(t, { preexistingSelection: true });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(existed, migrationHead(existed)), existed.root), /absent predecessor preview selection/);
  const f = fixture(t);
  for (const [name, policy, pattern] of [
    ['reviewer-settings', migratedPolicy(f, { model: 'different-model' }), /settings/],
    ['general-v3', migratedPolicy(f, { version: 3 }), /Unsupported|unrelated branch acceptance policy/],
    ['omitted-authority', migratedPolicy(f, { manifest: '.codex/gatekeeper/omitted.json' }), /changes, reorders, omits or replaces predecessor authority/],
    ['trusted-route', migratedPolicy(f, { trustedRoute: true }), /owner amendment selection|trusted acceptance route/],
  ]) {
    const head = migrationHead(f, { policy }); await assert.rejects(preparePreviewLifecycle(migrationSpec(f, head), f.root), pattern, name);
  }
  const changed = migrationHead(f, { extra: { [authority[0]]: 'Candidate changed canonical authority bytes.\n' } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(f, changed), f.root), /three control-plane paths|changes, reorders, omits or replaces predecessor authority/);
});

test('initial migration cannot become eligible when its unchanged closed predecessor schema rejects successor authority IDs', async t => {
  const f = fixture(t, { schemaAllowsSuccessorIds: false });
  const head = migrationHead(f);
  const request = await preparePreviewLifecycle(migrationSpec(f, head), f.root);
  await assert.rejects(completePreviewLifecycle(request, ordinary('PASS'), f.root), /successor authority IDs are incompatible with the unchanged predecessor decision schema/);
});

test('initial migration diff ignores configured textconv and preserves the committed patch', async t => {
  const f = fixture(t, { withTextconv: true });
  const head = migrationHead(f);
  assert.match(git(f.root, 'check-attr', 'diff', '--', policyPath), /diff: preview-hostile/);
  const request = await preparePreviewLifecycle(migrationSpec(f, head), f.root);
  const taskText = request.prompt.split('Bound task:\n')[1].split('\nReturn only')[0];
  const task = JSON.parse(taskText);
  const committedDiff = execFileSync('git', ['-C', f.root, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', f.base, head],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(task.diff, committedDiff);
  assert.equal(task.diff.endsWith('\n'), true);
  assert.match(task.diff, /authorityManifestPath/);
  assert.doesNotMatch(task.diff, /SPOOFED TEXTCONV DIFF/);
  assert.equal(existsSync(f.textconvMarker), false);
});

test('migration observation rejects bad receipt trailer and wrong integration parent/tree', async t => {
  const f = fixture(t); const head = migrationHead(f); const request = await preparePreviewLifecycle(migrationSpec(f, head), f.root);
  const receipt = await completePreviewLifecycle(request, ordinary('PASS'), f.root);
  const badTrailer = integrate(f, head, receipt, `sha256:${'0'.repeat(64)}`);
  await assert.rejects(observePreviewLifecycle(receipt, badTrailer, f.root), /trailer/);
  const goodTrailer = `sha256:${sha(previewReceiptBytes(receipt))}`;
  git(f.root, 'switch', '-c', 'main-reset-before-wrong-parent', f.base);
  git(f.root, 'branch', '-f', 'main', f.base);
  const wrongParent = git(f.root, 'commit-tree', `${head}^{tree}`, '-p', head, '-p', f.base, '-m', `wrong parent\n\nAGK-Preview-Receipt-v1: ${goodTrailer}`);
  git(f.root, 'branch', '-f', 'main', wrongParent);
  await assert.rejects(observePreviewLifecycle(receipt, wrongParent, f.root), /exact base\/B and B tree/);
  git(f.root, 'switch', '-c', 'main-reset-before-wrong-tree', f.base);
  const wrongTree = git(f.root, 'commit-tree', `${f.base}^{tree}`, '-p', f.base, '-p', head, '-m', `wrong tree\n\nAGK-Preview-Receipt-v1: ${goodTrailer}`);
  git(f.root, 'branch', '-f', 'main', wrongTree);
  await assert.rejects(observePreviewLifecycle(receipt, wrongTree, f.root), /exact base\/B and B tree/);
});
