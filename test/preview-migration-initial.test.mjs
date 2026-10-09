import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
const authoritySetModule = await import(new URL('./authority-set.mjs', import.meta.resolve('@flair-agency/architecture-gatekeeper/preview-lifecycle')));
const { materializeAuthoritySet } = authoritySetModule;
import { PREVIEW_PROFILE, preparePreviewLifecycle, completePreviewLifecycle,
  observePreviewLifecycle, prepareFreshPreviewReview, previewReceiptBytes, validatePreviewReceipt } from '@flair-agency/architecture-gatekeeper/preview-lifecycle';

const authority = ['docs/architecture.md', 'docs/governance.md'];
const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
const policyPath = '.codex/gatekeeper/ci-policy.json';
const callerPath = '.github/workflows/architecture-gate.yml';
const manifestPath = '.codex/gatekeeper/authorities.json';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, file, value) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const sha = value => createHash('sha256').update(value).digest('hex');
let next = 0;
function fixture(t, { preexistingSelection = true, selectionOverrides = {}, schemaAllowsSuccessorIds = true, withTextconv = false,
  constrainLegacyAuthorityId = false, successorIds = ['architecture', 'governance'],
  closedAuthorityAlternatives = false, otherLegacyBranches = {}, successorSchema = null, successorRules = null,
  legacySchemaDigest = false, legacyRulesDigest = false, legacySchemaOpen = false } = {}) {
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
    migrationPaths: [selectionPath, policyPath, callerPath], maxPromptBytes: 524288, ...selectionOverrides };
  const decisionProperties = {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' },
    authorityFiles: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } };
  if (legacySchemaDigest) decisionProperties.authoritySetDigest = { type: 'string' };
  if (schemaAllowsSuccessorIds) decisionProperties.authorityIds = { type: 'array', items: { type: 'string' } };
  const filesDecisionSchema = { type: 'object', additionalProperties: legacySchemaOpen ? true : false,
    required: ['decision', 'summary', 'authorityFiles', 'valid'], properties: decisionProperties };
  const decisionSchema = closedAuthorityAlternatives ? { anyOf: [
    { ...filesDecisionSchema, properties: Object.fromEntries(Object.entries(decisionProperties).filter(([key]) => key !== 'authorityIds')) },
    { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityIds', 'valid'],
      properties: Object.fromEntries(Object.entries(decisionProperties).filter(([key]) => key !== 'authorityFiles')) },
    ...(closedAuthorityAlternatives === 'with-both' ? [{ ...filesDecisionSchema,
      required: ['decision', 'summary', 'authorityFiles', 'authorityIds', 'valid'] }] : []),
  ] } : filesDecisionSchema;
  const bSchema = structuredClone(filesDecisionSchema); bSchema.required = ['decision', 'summary', 'authorityIds', 'valid'];
  delete bSchema.properties.authorityFiles; bSchema.properties.decision.enum = ['ELIGIBLE', 'INELIGIBLE'];
  put(root, authority[0], 'Existing architecture decision.\n'); put(root, authority[1], 'Owner selected legacy v1 review procedure.\n'); put(root, 'app.txt', 'before\n');
  if (withTextconv) put(root, '.gitattributes', `${policyPath} diff=preview-hostile\n`);
  put(root, promptPath, 'Review the complete selected predecessor authority and migration changes.\n'); put(root, schemaPath, decisionSchema);
  const legacyRules = [{ when: { path: '/decision', equals: 'PASS' }, require: { path: '/valid', equals: true }, message: 'old selected validator' }];
  if (legacyRulesDigest) legacyRules.push({ when: { path: '/decision', equals: 'PASS' },
    require: { path: '/authoritySetDigest', equals: 'old-digest' }, message: 'old digest equality' });
  if (constrainLegacyAuthorityId) legacyRules.push({ when: { path: '/decision', equals: 'PASS' },
    require: { path: '/authorityIds/0', equals: 'architecture' }, message: 'old selected authority ID validator' });
  put(root, validationPath, { version: 1, rules: legacyRules });
  put(root, selection.eligibilitySchemaPath, successorSchema ?? bSchema); put(root, selection.eligibilityValidationPath,
    successorRules ?? { version: 1, rules: [{ when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'successor B validator' }] });
  const authorities = authority.map((path, index) => ({ id: successorIds[index], repository: 'self', revision: 'authority-revision', path }));
  put(root, manifestPath, { version: 1, authorities }); put(root, '.codex/gatekeeper/omitted.json', { version: 1, authorities: [authorities[0]] });
  const legacyMain = { mode: 'enforced', model: 'gpt-6-luna', reasoningEffort: 'low',
    authorityFiles: authority, promptPath, schemaPath, validationPath };
  const legacyDefault = { mode: 'local-only' };
  const branches = { ...structuredClone(otherLegacyBranches), main: legacyMain };
  const legacyPolicy = { version: 1, default: legacyDefault, branches };
  put(root, policyPath, legacyPolicy);
  put(root, callerPath, 'uses: fixture/reviewer@old-pin\n');
  if (preexistingSelection) put(root, selectionPath, selection);
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic old enforced v1 predecessor');
  return { root, selection, base: git(root, 'rev-parse', 'HEAD'), promptPath, schemaPath, validationPath,
    legacyDefault, legacyOtherBranches: otherLegacyBranches, legacyPolicy,
    before: 'Existing architecture decision.\n', textconvMarker: textconvMarker?.marker };
}
function migratedPolicy(f, { version = 2, model = 'gpt-6-luna', manifest = manifestPath, trustedRoute = false,
  maxMembers = 16 } = {}) {
  const branch = { mode: 'enforced', model, reasoningEffort: 'low', authorityManifestPath: manifest,
    authorityLimits: { maxManifestBytes: 16384, maxMembers, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 } };
  if (trustedRoute) branch.ownerAmendment = { version: 1, grade: 'G0' };
  return { version, default: structuredClone(f.legacyDefault), branches: { ...structuredClone(f.legacyOtherBranches), main: branch } };
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
  const successorSchema = { type: 'object', additionalProperties: false,
    required: ['decision', 'summary', 'authorityIds', 'valid', 'successorOnlyField'],
    properties: { decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] }, summary: { type: 'string' },
      authorityIds: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' },
      successorOnlyField: { enum: ['B-only value'] } } };
  const f = fixture(t, { successorSchema }); const head = migrationHead(f);
  const request = await preparePreviewLifecycle(migrationSpec(f, head), f.root);
  assert.equal(request.policy.policyVersion, 1); assert.match(request.prompt, /only the predecessor's legacy v1 policy/);
  assert.equal(request.inputs.some(input => input.path === selectionPath), true);
  assert.equal(request.successorAuthoritySet.members.length, 2);
  assert.equal(request.successorAuthoritySet.manifest.path, manifestPath);
  assert.equal(request.successorInputs.length, 2);
  const materialized = await materializeAuthoritySet({ manifestBytes: Buffer.from(request.successorAuthoritySet.manifest.bytesBase64, 'base64'),
    limits: migratedPolicy(f).branches.main.authorityLimits, selfRepository: request.spec.repository,
    selfRoot: f.root, authorityRevision: head, profile: request.policy.authorityProfile ?? 'v1' });
  assert.equal(request.successorAuthoritySet.setDigest, materialized.setDigest);
  for (const member of request.successorAuthoritySet.members) {
    const predecessor = request.authoritySet.members.find(item => item.path === member.path);
    assert.equal(member.sha256, predecessor.sha256); assert.equal(member.byteLength, predecessor.byteLength);
  }
  const receipt = await completePreviewLifecycle(request, ordinary('PASS'), f.root);
  assert.equal(receipt.eligibility, 'ELIGIBLE');
  const rejected = await completePreviewLifecycle(request, ordinary('BLOCK'), f.root);
  assert.equal(rejected.eligibility, 'INELIGIBLE');
  assert.equal(rejected.decision.decision, 'BLOCK');
  const integration = integrate(f, head, receipt);
  git(f.root, 'commit', '--allow-empty', '-m', 'Synthetic target advance with unchanged successor authority');
  const target = git(f.root, 'rev-parse', 'HEAD');
  const final = await observePreviewLifecycle(receipt, integration, f.root);
  assert.equal(final.adoption, 'OBSERVED'); assert.equal(final.canonical, 'VERIFIED');
  assert.ok(final.successorAuthoritySet, 'final migration record binds the materialized post-merge successor Authority Set');
  const integrationSet = await materializeAuthoritySet({ manifestBytes: Buffer.from(request.successorAuthoritySet.manifest.bytesBase64, 'base64'),
    limits: migratedPolicy(f).branches.main.authorityLimits, selfRepository: request.spec.repository, selfRoot: f.root,
    authorityRevision: integration, profile: 'v1' });
  const targetSet = await materializeAuthoritySet({ manifestBytes: Buffer.from(request.successorAuthoritySet.manifest.bytesBase64, 'base64'),
    limits: migratedPolicy(f).branches.main.authorityLimits, selfRepository: request.spec.repository, selfRoot: f.root,
    authorityRevision: target, profile: 'v1' });
  assert.equal(final.successorAuthoritySet.integration.resolvedRevision, integration);
  assert.equal(final.successorAuthoritySet.integration.setDigest, integrationSet.setDigest);
  assert.notEqual(final.successorAuthoritySet.integration.setDigest, request.successorAuthoritySet.setDigest);
  assert.deepEqual(final.successorAuthoritySet.integration.members, integrationSet.members.map(({ content, ...member }) => member));
  assert.equal(final.targetSha, target);
  assert.equal(final.successorAuthoritySet.target.resolvedRevision, target);
  assert.equal(final.successorAuthoritySet.target.setDigest, targetSet.setDigest);
  assert.notEqual(final.successorAuthoritySet.integration.setDigest, final.successorAuthoritySet.target.setDigest);
  assert.deepEqual(final.successorAuthoritySet.integration.members.map(({ byteLength, sha256 }) => ({ byteLength, sha256 })),
    final.successorAuthoritySet.target.members.map(({ byteLength, sha256 }) => ({ byteLength, sha256 })));
  const changedFinal = { ...final, successorAuthoritySet: { ...final.successorAuthoritySet,
    integration: { ...final.successorAuthoritySet.integration, setDigest: '0'.repeat(64) } } };
  const { integritySha256: ignoredIntegrity, ...unsignedFinal } = changedFinal;
  changedFinal.integritySha256 = sha(previewReceiptBytes(unsignedFinal));
  await assert.rejects(prepareFreshPreviewReview(changedFinal, head, f.root), /final readback bindings changed/);
  assert.equal(final.assurance.hostEnforcement, 'UNVERIFIED');
  const aHead = commit(f, final.targetSha, { 'app.txt': 'Successor A under migrated selector\n' });
  const fresh = await prepareFreshPreviewReview(final, aHead, f.root);
  assert.equal(fresh.spec.baseSha, final.targetSha); assert.equal(fresh.selection.profile, PREVIEW_PROFILE);
  assert.notEqual(fresh.authoritySet.setDigest, request.successorAuthoritySet.setDigest);
  const trigger = await completePreviewLifecycle(fresh, ordinary('BLOCK', true), f.root);
  const bHead = commit(f, final.targetSha, { [authority[0]]: 'Existing architecture decision amended under successor rules.\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: final.targetSha, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(trigger)), target: 'existing decision', purpose: 'Synthetic successor BLOCK resolution' };
  const bRequest = await preparePreviewLifecycle({ ...fresh.spec, baseSha: final.targetSha, headSha: bHead, mode: 'amendment', trigger, record }, f.root);
  const bResponse = B(); bResponse.semanticDecision = { decision: 'ELIGIBLE', summary: 'Synthetic successor B classification; no model execution claim.', authorityIds: ['architecture', 'governance'], valid: true };
  await assert.rejects(completePreviewLifecycle(bRequest, bResponse, f.root), /successorOnlyField is required/);
  bResponse.semanticDecision.successorOnlyField = 'B-only value';
  const bReceipt = await completePreviewLifecycle(bRequest, bResponse, f.root);
  assert.equal(bReceipt.eligibility, 'ELIGIBLE');
  const bIneligible = structuredClone(bResponse);
  bIneligible.semanticDecision.decision = 'INELIGIBLE';
  const ineligibleReceipt = await completePreviewLifecycle(bRequest, bIneligible, f.root);
  assert.equal(ineligibleReceipt.eligibility, 'INELIGIBLE');
  assert.deepEqual(ineligibleReceipt.response, bIneligible);
  // Observation revalidates the receipt before rejecting its ineligible status.
  await assert.rejects(observePreviewLifecycle(ineligibleReceipt, integration, f.root), /not an eligible selected B procedure/);
});

test('initial migration retains valid non-PASS decisions as ineligible receipts, including missing authorization', async t => {
  const f = fixture(t); const head = migrationHead(f);
  const request = await preparePreviewLifecycle(migrationSpec(f, head), f.root);
  for (const kind of ['BLOCK', 'OWNER_DECISION']) {
    for (const predecessorAuthorized of [true, false]) {
      const response = ordinary(kind);
      response.checks.predecessorAuthorized = predecessorAuthorized;
      const originalResponse = structuredClone(response);
      const receipt = await completePreviewLifecycle(request, response, f.root);
      assert.equal(receipt.eligibility, 'INELIGIBLE');
      assert.deepEqual(receipt.decision, originalResponse.semanticDecision);
      assert.deepEqual(receipt.response, originalResponse);
      // Observation revalidates each receipt before rejecting its ineligible status.
      await assert.rejects(observePreviewLifecycle(receipt, head, f.root), /not an eligible selected B procedure/);
    }
  }

  const unauthorizedPass = ordinary('PASS');
  unauthorizedPass.checks.predecessorAuthorized = false;
  await assert.rejects(completePreviewLifecycle(request, unauthorizedPass, f.root), /predecessor governance did not authorize/);
});
function commit(f, base, changes) {
  git(f.root, 'switch', '-c', `after-migration-${++next}`, base);
  for (const [file, value] of Object.entries(changes)) put(f.root, file, value);
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Synthetic post-migration change'); return git(f.root, 'rev-parse', 'HEAD');
}

test('initial migration requires a predecessor-recorded selection bound to the exact repository, target, scope and reviewer inputs', async t => {
  const missing = fixture(t, { preexistingSelection: false });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(missing, migrationHead(missing)), missing.root), /not a regular Git file|does not exist|missing/i);

  const replay = fixture(t);
  const replayHead = migrationHead(replay);
  await assert.rejects(preparePreviewLifecycle({ ...migrationSpec(replay, replayHead), targetBranch: 'release' }, replay.root), /previous selection is invalid/);
  await assert.rejects(preparePreviewLifecycle({ ...migrationSpec(replay, replayHead), repository: 'other/repository' }, replay.root), /previous selection is invalid/);

  const wrongScope = fixture(t, { selectionOverrides: { migrationPaths: [selectionPath, policyPath, callerPath, 'unselected.txt'] } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(wrongScope, migrationHead(wrongScope)), wrongScope.root), /exact migration scope/);
  const wrongReviewer = fixture(t, { selectionOverrides: { promptPath: '.codex/gatekeeper/candidate-prompt.md' } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(wrongReviewer, migrationHead(wrongReviewer)), wrongReviewer.root), /compatible predecessor-recorded v1 preview selection/);
  const changedSelection = fixture(t);
  const changedHead = migrationHead(changedSelection, { selection: { ...changedSelection.selection, authorization: 'Candidate-added authorization' } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(changedSelection, changedHead), changedSelection.root), /cannot replace or expand/);
  const reformattedSelection = fixture(t);
  const reformattedHead = migrationHead(reformattedSelection, { selection: `${JSON.stringify(reformattedSelection.selection, null, 2)}\n` });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(reformattedSelection, reformattedHead), reformattedSelection.root), /cannot replace or expand/);
});

test('initial migration requires the predecessor-selected caller to remain a regular candidate file', async t => {
  const deleted = fixture(t);
  migrationHead(deleted);
  git(deleted.root, 'rm', '--', callerPath);
  git(deleted.root, 'commit', '-m', 'Delete selected candidate caller');
  await assert.rejects(preparePreviewLifecycle(migrationSpec(deleted, git(deleted.root, 'rev-parse', 'HEAD')), deleted.root), /missing or ambiguous|not a regular file/);

  const symlinked = fixture(t);
  migrationHead(symlinked);
  rmSync(join(symlinked.root, callerPath));
  symlinkSync('other-workflow.yml', join(symlinked.root, callerPath));
  git(symlinked.root, 'add', '-A');
  git(symlinked.root, 'commit', '-m', 'Replace selected candidate caller with symlink');
  await assert.rejects(preparePreviewLifecycle(migrationSpec(symlinked, git(symlinked.root, 'rev-parse', 'HEAD')), symlinked.root), /missing or ambiguous|not a regular file/);
});

test('initial migration also fails closed on changed reviewer settings, v3, omitted set, authority edits and trusted route', async t => {
  const f = fixture(t);
  for (const [name, policy, pattern] of [
    ['reviewer-settings', migratedPolicy(f, { model: 'different-model' }), /settings/],
    ['general-v3', migratedPolicy(f, { version: 3 }), /Unsupported|unrelated branch acceptance policy/],
    ['omitted-authority', migratedPolicy(f, { manifest: '.codex/gatekeeper/omitted.json' }), /changes, reorders, omits or replaces predecessor authority/],
    ['expanded-member-limit', migratedPolicy(f, { maxMembers: 17 }), /legacy authority bounds/],
    ['trusted-route', migratedPolicy(f, { trustedRoute: true }), /owner amendment selection|trusted acceptance route/],
  ]) {
    const head = migrationHead(f, { policy }); await assert.rejects(preparePreviewLifecycle(migrationSpec(f, head), f.root), pattern, name);
  }
  const changed = migrationHead(f, { extra: { [authority[0]]: 'Candidate changed canonical authority bytes.\n' } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(f, changed), f.root), /three control-plane paths|changes, reorders, omits or replaces predecessor authority/);
});

test('initial v1-to-v2 migration supports only the named-target v1 shape while v1-to-v1 remains compatible', async t => {
  const multipleNamedEnforced = fixture(t, { otherLegacyBranches: { release: {
    mode: 'enforced', model: 'gpt-6-luna', reasoningEffort: 'low', authorityFiles: authority,
    promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', validationPath: '.codex/gatekeeper/rules.json' } } });
  const multiplePolicy = migratedPolicy(multipleNamedEnforced);
  multiplePolicy.branches.release = structuredClone(multiplePolicy.branches.main);
  const multipleHead = migrationHead(multipleNamedEnforced, { policy: multiplePolicy });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(multipleNamedEnforced, multipleHead), multipleNamedEnforced.root), /supports only one named enforced target/);
  const sameVersionHead = migrationHead(multipleNamedEnforced, { policy: multipleNamedEnforced.legacyPolicy });
  const sameVersionRequest = await preparePreviewLifecycle(migrationSpec(multipleNamedEnforced, sameVersionHead), multipleNamedEnforced.root);
  assert.equal((await completePreviewLifecycle(sameVersionRequest, ordinary('PASS'), multipleNamedEnforced.root)).eligibility, 'ELIGIBLE');

  const enforcedDefault = fixture(t);
  const changedDefault = migratedPolicy(enforcedDefault);
  changedDefault.default = structuredClone(changedDefault.branches.main);
  const enforcedDefaultHead = migrationHead(enforcedDefault, { policy: changedDefault });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(enforcedDefault, enforcedDefaultHead), enforcedDefault.root), /unrelated branch acceptance policy/);

  const localOther = fixture(t, { otherLegacyBranches: { release: { mode: 'local-only' } } });
  const localOtherHead = migrationHead(localOther);
  const localOtherRequest = await preparePreviewLifecycle(migrationSpec(localOther, localOtherHead), localOther.root);
  assert.equal((await completePreviewLifecycle(localOtherRequest, ordinary('PASS'), localOther.root)).eligibility, 'ELIGIBLE');
});

test('initial migration rejects a successor B schema that cannot represent the complete v2 authority IDs', async t => {
  const f = fixture(t, { schemaAllowsSuccessorIds: false });
  const head = migrationHead(f);
  await assert.rejects(preparePreviewLifecycle(migrationSpec(f, head), f.root), /requires a successor B schema with required decision and authorityIds/);
});

test('a supported successor B schema does not weaken unchanged predecessor schema compatibility', async t => {
  const successorSchema = { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityIds', 'valid'],
    properties: { decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] }, summary: { type: 'string' },
      authorityIds: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } } };
  const f = fixture(t, { schemaAllowsSuccessorIds: false, successorSchema });
  const request = await preparePreviewLifecycle(migrationSpec(f, migrationHead(f)), f.root);
  await assert.rejects(completePreviewLifecycle(request, ordinary('PASS'), f.root), /successor authority IDs are incompatible with the unchanged predecessor schema or required validators/);
});

test('initial v1-to-v2 B schema check is structural and does not synthesize B-only values', async t => {
  const filesOnly = fixture(t, { successorSchema: { type: 'object', additionalProperties: false, required: ['authorityFiles'],
    properties: { authorityFiles: { type: 'array', items: { type: 'string' } } } } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(filesOnly, migrationHead(filesOnly)), filesOnly.root), /requires a successor B schema/);

  const coreSchema = { type: 'object', additionalProperties: false, required: ['decision', 'authorityIds'],
    properties: { decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] }, authorityIds: { type: 'array', items: { type: 'string' } } } };
  const missingDecision = fixture(t, { successorSchema: { ...coreSchema, required: ['authorityIds'],
    properties: { authorityIds: coreSchema.properties.authorityIds } } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(missingDecision, migrationHead(missingDecision)), missingDecision.root), /requires a successor B schema/);
  for (const status of ['PASS', 'ELIGIBLE', 'INELIGIBLE']) {
    const oneDecision = fixture(t, { successorSchema: { ...coreSchema, properties: { ...coreSchema.properties,
      decision: { enum: [status] } } } });
    await assert.rejects(preparePreviewLifecycle(migrationSpec(oneDecision, migrationHead(oneDecision)), oneDecision.root), /must admit ELIGIBLE and INELIGIBLE/);
  }

  const composed = fixture(t, { successorSchema: { ...coreSchema, anyOf: [{ required: ['authorityIds'] }] } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(composed, migrationHead(composed)), composed.root), /does not support composed/);
  const composedIds = fixture(t, { successorSchema: { ...coreSchema, properties: { ...coreSchema.properties,
    authorityIds: { anyOf: [{ type: 'array', items: { type: 'string' } }] } } } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(composedIds, migrationHead(composedIds)), composedIds.root), /does not support composed/);
  const referencedDecision = fixture(t, { successorSchema: { ...coreSchema, properties: { ...coreSchema.properties,
    decision: { $ref: '#/$defs/decision' } }, $defs: { decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] } } } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(referencedDecision, migrationHead(referencedDecision)), referencedDecision.root), /self-contained successor B/);
  const enumRoot = fixture(t, { successorSchema: { ...coreSchema, enum: [{ authorityIds: ['architecture', 'governance'], decision: 'ELIGIBLE' }] } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(enumRoot, migrationHead(enumRoot)), enumRoot.root), /does not support composed/);
  for (const authorityIds of [
    { type: 'string' },
    { type: 'array', items: { type: 'boolean' } },
    { type: 'array', minItems: 3, items: { type: 'string' } },
    { type: 'array', enum: [['different-id']], items: { type: 'string' } },
  ]) {
    const invalidIds = fixture(t, { successorSchema: { ...coreSchema, properties: { ...coreSchema.properties, authorityIds } } });
    await assert.rejects(preparePreviewLifecycle(migrationSpec(invalidIds, migrationHead(invalidIds)), invalidIds.root), /self-contained successor B|does not match its schema|too few items|outside its enum/);
  }
});

test('initial v1-to-v2 rejects digest-coupled predecessor and successor B inputs', async t => {
  for (const options of [{ legacySchemaDigest: true }, { legacyRulesDigest: true }]) {
    const f = fixture(t, options);
    await assert.rejects(preparePreviewLifecycle(migrationSpec(f, migrationHead(f)), f.root), /does not support digest-coupled predecessor/);
  }
  const bDigestSchema = fixture(t, { successorSchema: { type: 'object', required: ['decision', 'authorityIds', 'authoritySetDigest'],
    properties: { decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] }, authorityIds: { type: 'array', items: { type: 'string' } },
      authoritySetDigest: { type: 'string' } } } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(bDigestSchema, migrationHead(bDigestSchema)), bDigestSchema.root), /digest-coupled successor B schemas/);
  const bDigestRules = fixture(t, { successorRules: { version: 1, rules: [{ when: { path: '/decision', equals: 'ELIGIBLE' },
    require: { path: '/authoritySetDigest', equals: 'future-integration-digest' }, message: 'digest coupling' }] } });
  await assert.rejects(preparePreviewLifecycle(migrationSpec(bDigestRules, migrationHead(bDigestRules)), bDigestRules.root), /digest-coupled successor B validators/);

  const actualM = fixture(t, { legacySchemaOpen: true });
  const actualMRequest = await preparePreviewLifecycle(migrationSpec(actualM, migrationHead(actualM)), actualM.root);
  const actualMResponse = ordinary('PASS');
  actualMResponse.semanticDecision.authoritySetDigest = actualMRequest.authoritySet.setDigest;
  await assert.rejects(completePreviewLifecycle(actualMRequest, actualMResponse, actualM.root), /does not support digest-bearing M PASS decisions/);
  for (const kind of ['BLOCK', 'OWNER_DECISION']) {
    const rejected = ordinary(kind);
    rejected.semanticDecision.authoritySetDigest = actualMRequest.authoritySet.setDigest;
    const original = structuredClone(rejected);
    const receipt = await completePreviewLifecycle(actualMRequest, rejected, actualM.root);
    assert.equal(receipt.eligibility, 'INELIGIBLE');
    assert.deepEqual(receipt.response, original);
    await validatePreviewReceipt(receipt, actualM.root);
    await assert.rejects(observePreviewLifecycle(receipt, actualMRequest.spec.headSha, actualM.root), /not an eligible selected B procedure/);
  }
});

test('initial v1-to-v2 rejects unsupported successor B authority rules but ignores unrelated B-only requirements at M', async t => {
  for (const rule of [
    { when: { path: '/authorityIds/0', equals: 'architecture' }, require: { path: '/valid', equals: true }, message: 'ID condition' },
    { when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/authorityIds/0', equals: 'wrong-id' }, message: 'wrong ID' },
    { when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/authorityFiles/0', equals: 'docs/architecture.md' }, message: 'legacy path condition' },
    { when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/decision', equals: 'INELIGIBLE' }, message: 'contradictory status' },
    { when: { path: '/futureOnly', equals: 'value' }, require: { path: '/decision', equals: 'ELIGIBLE' }, message: 'unknown core condition' },
    { when: { path: '/decision/0', equals: 'E' }, require: { path: '/valid', equals: true }, message: 'decision subfield' },
    { when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/decision/0', equals: 'E' }, message: 'required decision subfield' },
  ]) {
    const f = fixture(t, { successorRules: { version: 1, rules: [rule] } });
    await assert.rejects(preparePreviewLifecycle(migrationSpec(f, migrationHead(f)), f.root), /successor B rules|successor B authority-ID rule|successor B authority-field rule|decision subfields|excludes a required eligibility outcome|unknown conditions/);
  }

  const exactId = fixture(t, { successorRules: { version: 1, rules: [
    { when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/authorityIds/0', equals: 'architecture' }, message: 'known ID condition' },
  ] } });
  const exactIdRequest = await preparePreviewLifecycle(migrationSpec(exactId, migrationHead(exactId)), exactId.root);
  assert.equal((await completePreviewLifecycle(exactIdRequest, ordinary('PASS', true), exactId.root)).eligibility, 'ELIGIBLE');
});

test('initial migration does not solve unrelated B-only constraints; actual B validation still applies them', async t => {
  const successorSchema = { type: 'object', additionalProperties: false,
    required: ['decision', 'summary', 'authorityIds', 'valid', 'futureOnly'],
    properties: { decision: { enum: ['ELIGIBLE', 'INELIGIBLE'] }, summary: { type: 'string' },
      authorityIds: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' },
      futureOnly: { enum: ['schema value'] } } };
  const successorRules = { version: 1, rules: [
    { when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'B-only ordinary rule' },
    { when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/futureOnly', equals: 'different rule value' }, message: 'B-only rule conflict' },
  ] };
  const f = fixture(t, { successorSchema, successorRules });
  const head = migrationHead(f); const request = await preparePreviewLifecycle(migrationSpec(f, head), f.root);
  const migrationReceipt = await completePreviewLifecycle(request, ordinary('PASS'), f.root);
  assert.equal(migrationReceipt.eligibility, 'ELIGIBLE');
  const integration = integrate(f, head, migrationReceipt);
  const observed = await observePreviewLifecycle(migrationReceipt, integration, f.root);
  assert.equal(observed.successorAuthoritySet.integration.resolvedRevision, integration);
  assert.equal(observed.successorAuthoritySet.target.resolvedRevision, integration);
  assert.equal(observed.successorAuthoritySet.integration.setDigest, observed.successorAuthoritySet.target.setDigest);
  const aHead = commit(f, observed.targetSha, { 'app.txt': 'Successor A\n' });
  const fresh = await prepareFreshPreviewReview(observed, aHead, f.root);
  const trigger = await completePreviewLifecycle(fresh, ordinary('BLOCK', true), f.root);
  const bHead = commit(f, observed.targetSha, { [authority[0]]: 'Amended decision\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: observed.targetSha, bSha: bHead,
    triggerReceiptSha256: sha(previewReceiptBytes(trigger)), target: 'existing decision', purpose: 'Synthetic B validation fixture' };
  const bRequest = await preparePreviewLifecycle({ ...fresh.spec, baseSha: observed.targetSha, headSha: bHead,
    mode: 'amendment', trigger, record }, f.root);
  const bResponse = B();
  bResponse.semanticDecision = { decision: 'ELIGIBLE', summary: 'Synthetic B validation fixture.',
    authorityIds: ['architecture', 'governance'], valid: true, futureOnly: 'schema value' };
  await assert.rejects(completePreviewLifecycle(bRequest, bResponse, f.root), /B-only rule conflict/);
});

test('initial migration checks successor authority IDs against unchanged predecessor decision rules', async t => {
  const compatible = fixture(t, { constrainLegacyAuthorityId: true });
  const compatibleHead = migrationHead(compatible);
  const compatibleRequest = await preparePreviewLifecycle(migrationSpec(compatible, compatibleHead), compatible.root);
  const compatibleResponse = ordinary('PASS', true);
  const compatibleReceipt = await completePreviewLifecycle(compatibleRequest, compatibleResponse, compatible.root);
  assert.equal(compatibleReceipt.eligibility, 'ELIGIBLE');
  assert.deepEqual(compatibleResponse.semanticDecision.authorityIds, ['architecture', 'governance']);

  const incompatible = fixture(t, { constrainLegacyAuthorityId: true, successorIds: ['successor-architecture', 'successor-governance'] });
  const incompatibleHead = migrationHead(incompatible);
  const incompatibleRequest = await preparePreviewLifecycle(migrationSpec(incompatible, incompatibleHead), incompatible.root);
  const actualResponse = ordinary('PASS', true);
  await assert.rejects(completePreviewLifecycle(incompatibleRequest, actualResponse, incompatible.root), /unchanged predecessor schema or required validators/);
  assert.deepEqual(actualResponse.semanticDecision.authorityIds, ['architecture', 'governance']);
});

test('initial migration accepts a closed successor ID alternative only when unchanged schema and rules both validate it', async t => {
  const compatible = fixture(t, { closedAuthorityAlternatives: true });
  const compatibleHead = migrationHead(compatible);
  const compatibleRequest = await preparePreviewLifecycle(migrationSpec(compatible, compatibleHead), compatible.root);
  const actualResponse = ordinary('PASS');
  const originalResponse = structuredClone(actualResponse);
  const receipt = await completePreviewLifecycle(compatibleRequest, actualResponse, compatible.root);
  assert.equal(receipt.eligibility, 'ELIGIBLE');
  assert.deepEqual(receipt.response, originalResponse);
  await validatePreviewReceipt(receipt, compatible.root);

  const incompatible = fixture(t, { closedAuthorityAlternatives: 'with-both', constrainLegacyAuthorityId: true,
    successorIds: ['successor-architecture', 'successor-governance'] });
  const incompatibleHead = migrationHead(incompatible);
  const incompatibleRequest = await preparePreviewLifecycle(migrationSpec(incompatible, incompatibleHead), incompatible.root);
  const unchanged = ordinary('PASS', true);
  const unchangedBefore = structuredClone(unchanged);
  await assert.rejects(completePreviewLifecycle(incompatibleRequest, unchanged, incompatible.root), /successor authority IDs are incompatible/);
  assert.deepEqual(unchanged, unchangedBefore);
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
