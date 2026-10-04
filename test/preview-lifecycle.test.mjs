import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { PREVIEW_PROFILE, preparePreviewLifecycle, completePreviewLifecycle,
  observePreviewLifecycle, prepareFreshPreviewReview } from '../src/preview-lifecycle.mjs';
import { parseOwnerAmendmentBlockRecord } from '../src/owner-amendment.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const files = ['docs/authority.md', 'docs/governance.md'];
const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
const allChecks = Object.fromEntries(['addressesTrigger', 'withinSelectedScope', 'authorityOnly',
  'noUnrelatedChanges', 'coherentResult', 'noUnsupportedClaims', 'predecessorAuthorized'].map(k => [k, true]));
const ordinary = semanticDecision => ({ semanticDecision, checks: { predecessorAuthorized: true } });
const decision = (value = 'PASS', ids = false) => ({ decision: value, summary: 'Synthetic model response; no semantic correctness claim.',
  authorityFiles: files, ...(ids ? { authorityIds: ['contract', 'governance'] } : {}), valid: true });
function put(root, file, value) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
}
function fixture(t, selected = true) {
  const root = mkdtempSync(join(tmpdir(), 'preview-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  const selection = { version: 1, profile: PREVIEW_PROFILE, repository: 'fixture/example', targetBranch: 'main',
    governancePath: files[1], authorization: 'Synthetic owner-selected unverified preview procedure.',
    policyPath: '.codex/gatekeeper/ci-policy.json', promptPath: '.codex/gatekeeper/ci-prompt.md',
    schemaPath: '.codex/gatekeeper/decision.schema.json', validationPath: '.codex/gatekeeper/rules.json',
    callerPath: '.github/workflows/architecture-gate.yml', authorityPaths: [files[0]],
    migrationPaths: [selectionPath, '.codex/gatekeeper/ci-policy.json', '.github/workflows/architecture-gate.yml'], maxPromptBytes: 524288 };
  put(root, files[0], 'Existing rule: keep selected predecessor rules.\n');
  put(root, files[1], 'Owner may select explicit preview assurance; integration is owner controlled.\n');
  put(root, 'app.txt', 'Original application\n');
  put(root, selection.promptPath, 'Review actual proposed change under full prior authority.\n');
  put(root, selection.callerPath, 'uses: owner/runtime@1111111111111111111111111111111111111111\n');
  put(root, selection.schemaPath, { type: 'object', additionalProperties: false,
    required: ['decision', 'summary', 'authorityFiles', 'valid'], properties: {
      decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' },
      authorityFiles: { type: 'array', items: { type: 'string' } }, authorityIds: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } } });
  put(root, selection.validationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' },
    require: { path: '/valid', equals: true }, message: 'Synthetic mandatory consumer validator' }] });
  const branch = { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityFiles: files,
    promptPath: selection.promptPath, schemaPath: selection.schemaPath, validationPath: selection.validationPath };
  put(root, selection.policyPath, { version: 1, default: { mode: 'local-only' }, branches: { main: branch } });
  put(root, '.codex/gatekeeper/authorities.json', { version: 1, authorities: files.map((path, index) => ({
    id: index ? 'governance' : 'contract', repository: 'self', revision: 'authority-revision', path })) });
  if (selected) put(root, selectionPath, selection);
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic predecessor');
  const base = git(root, 'rev-parse', 'HEAD');
  return { root, base, selection, branch };
}
function spec(f, mode, headSha, trigger = null, record = null, baseSha = f.base) {
  return { version: 1, repository: 'fixture/example', targetBranch: 'main', mode, baseSha, headSha, selectionPath, trigger, record };
}
function commitOn(f, name, changes, base = f.base) {
  git(f.root, 'switch', '-c', name, base);
  for (const [file, value] of Object.entries(changes)) put(f.root, file, value);
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', `Synthetic ${name}`);
  return git(f.root, 'rev-parse', 'HEAD');
}
function integrate(f, head) {
  git(f.root, 'switch', 'main'); git(f.root, 'merge', '--no-ff', '--no-edit', head);
  return git(f.root, 'rev-parse', 'HEAD');
}
async function triggerFor(f, result, name = 'a') {
  const head = commitOn(f, name, { 'app.txt': 'Proposed A\n' });
  const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
  return completePreviewLifecycle(request, ordinary(decision(result)), f.root);
}
async function eligibleB(f, mode, trigger) {
  const head = commitOn(f, `b-${mode}`, { [files[0]]: 'New owner-selected canonical rule\n' });
  const record = { version: 1, kind: `preview-${mode}-record`, baseSha: f.base, bSha: head,
    triggerReceiptSha256: trigger.integritySha256, target: 'Existing rule or missing choice', purpose: 'Synthetic owner resolution' };
  const request = await preparePreviewLifecycle(spec(f, mode, head, trigger, record), f.root);
  return { head, request, receipt: await completePreviewLifecycle(request, { semanticDecision: decision(), checks: allChecks }, f.root) };
}

for (const [mode, result] of [['amendment', 'BLOCK'], ['addition', 'OWNER_DECISION']]) {
  test(`${mode} executes complete real-Git preview adoption then fresh A without trusted claims`, async t => {
    const f = fixture(t); const trigger = await triggerFor(f, result);
    const b = await eligibleB(f, mode, trigger);
    const final = await observePreviewLifecycle(b.receipt, integrate(f, b.head), f.root);
    assert.equal(final.adoption, 'OBSERVED'); assert.equal(final.canonical, 'VERIFIED');
    assert.notEqual(final.integrationSha, b.head); assert.equal(final.assurance.producerAuthentication, 'UNVERIFIED');
    const freshHead = commitOn(f, `fresh-${mode}`, { 'app.txt': 'A reviewed under new authority\n' }, final.targetSha);
    const fresh = await prepareFreshPreviewReview(final, freshHead, f.root);
    assert.equal(fresh.spec.baseSha, final.targetSha); assert.match(fresh.prompt, /New owner-selected canonical rule/);
    assert.equal((await completePreviewLifecycle(fresh, ordinary(decision()), f.root)).decision.decision, 'PASS');
    assert.equal(trigger.decision.decision, result);
    assert.throws(() => parseOwnerAmendmentBlockRecord(Buffer.from(JSON.stringify(final))));
  });
}

test('old v1 control-plane migration uses old inputs; successor independently supports authority B', async t => {
  const f = fixture(t, false);
  const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: f.branch.model, reasoningEffort: f.branch.reasoningEffort,
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: {
      maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 } } } };
  const head = commitOn(f, 'control-plane', { [selectionPath]: f.selection, [f.selection.policyPath]: policy,
    [f.selection.callerPath]: 'uses: owner/runtime@2222222222222222222222222222222222222222\n' });
  const request = await preparePreviewLifecycle(spec(f, 'migration', head), f.root);
  assert.equal(request.policy.policyVersion, 1); assert.equal(request.reviewer.model, f.branch.model);
  assert.equal(request.successorAuthoritySet.manifest.path, '.codex/gatekeeper/authorities.json');
  assert.equal(request.successorAuthoritySet.members.length, 2);
  assert.ok(request.successorAuthoritySet.members.every(member => member.resolvedCommit === head && member.content));
  assert.match(request.prompt, /1111111111111111111111111111111111111111/); // diff supplies old caller
  await assert.rejects(completePreviewLifecycle(request, { semanticDecision: decision(), checks: {} }, f.root));
  await assert.rejects(completePreviewLifecycle(request, { semanticDecision: decision(), checks: { predecessorAuthorized: false } }, f.root), /governance/);
  const receipt = await completePreviewLifecycle(request, ordinary(decision()), f.root);
  const final = await observePreviewLifecycle(receipt, integrate(f, head), f.root);
  assert.ok(final.placement.some(member => member.path === request.successorAuthoritySet.manifest.path));
  // The successor manifest predates B and is unchanged in its diff, but it still
  // controls subsequent authority. A later target edit invalidates readback.
  const manifestMutation = commitOn(f, 'post-merge-manifest-change', {
    '.codex/gatekeeper/authorities.json': { version: 1, authorities: [
      { id: 'contract', repository: 'self', revision: 'authority-revision', path: files[0] },
    ] },
  }, final.targetSha);
  git(f.root, 'branch', '-f', 'main', manifestMutation);
  await assert.rejects(observePreviewLifecycle(receipt, final.integrationSha, f.root), /placement/);
  git(f.root, 'branch', '-f', 'main', final.targetSha);
  f.base = final.targetSha;
  const aHead = commitOn(f, 'successor-a', { 'app.txt': 'A under migrated inputs\n' });
  const aRequest = await preparePreviewLifecycle(spec(f, 'review', aHead), f.root);
  assert.equal(aRequest.authoritySet.members.length, 2);
  const trigger = await completePreviewLifecycle(aRequest, ordinary(decision('BLOCK', true)), f.root);
  const bHead = commitOn(f, 'successor-b', { [files[0]]: 'Rule amended after migration\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: f.base, bSha: bHead,
    triggerReceiptSha256: trigger.integritySha256, target: 'Existing rule', purpose: 'Resolve completed BLOCK' };
  const b = await preparePreviewLifecycle(spec(f, 'amendment', bHead, trigger, record), f.root);
  const bReceipt = await completePreviewLifecycle(b, { semanticDecision: decision('PASS', true), checks: allChecks }, f.root);
  assert.equal((await observePreviewLifecycle(bReceipt, integrate(f, bHead), f.root)).adoption, 'OBSERVED');
});

test('rejects incomplete semantics, consumer validator failures, omitted authority and stale records', async t => {
  const f = fixture(t); const trigger = await triggerFor(f, 'BLOCK'); const b = await eligibleB(f, 'amendment', trigger);
  await assert.rejects(completePreviewLifecycle(b.request, { semanticDecision: decision(), checks: { ...allChecks, coherentResult: false } }, f.root), /eligibility/);
  await assert.rejects(completePreviewLifecycle(b.request, { semanticDecision: { ...decision(), valid: false }, checks: allChecks }, f.root), /validator/);
  await assert.rejects(completePreviewLifecycle(b.request, { semanticDecision: { ...decision(), authorityFiles: [files[0]] }, checks: allChecks }, f.root), /complete predecessor/);
  await assert.rejects(completePreviewLifecycle(b.request, { semanticDecision: { ...decision(), decision: 'TIMEOUT' }, checks: allChecks }, f.root));
  const stale = structuredClone(b.receipt); stale.request.spec.headSha = f.base;
  await assert.rejects(observePreviewLifecycle(stale, b.head, f.root), /integrity/);
  await assert.rejects(preparePreviewLifecycle({ ...b.request.spec, record: { ...b.request.spec.record, bSha: f.base } }, f.root), /bindings/);
  const staleCaller = structuredClone(b.request); staleCaller.inputs.find(input => input.path === f.selection.callerPath).sha256 = '0'.repeat(64);
  await assert.rejects(completePreviewLifecycle(staleCaller, { semanticDecision: decision(), checks: allChecks }, f.root), /integrity/);
});

test('first selection rejects candidate instructions, authority omission and incompatible settings', async t => {
  const f = fixture(t, false);
  for (const [name, proposed, branch] of [
    ['candidate-instructions', { ...f.selection, promptPath: 'app.txt' }, f.branch],
    ['omitted-member', f.selection, { ...f.branch, authorityFiles: [files[0]] }],
    ['incompatible-settings', f.selection, { ...f.branch, reasoningEffort: 'low' }],
  ]) {
    const head = commitOn(f, name, { [selectionPath]: proposed,
      [f.selection.policyPath]: { version: 1, default: { mode: 'local-only' }, branches: { main: branch } } });
    await assert.rejects(preparePreviewLifecycle(spec(f, 'migration', head), f.root), /incompatible|omits|settings/);
  }
  // External authority is rejected, never filtered out to manufacture equivalence.
  const nextPolicy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: f.branch.model, reasoningEffort: f.branch.reasoningEffort,
    authorityManifestPath: '.codex/gatekeeper/foreign.json', authorityLimits: {
      maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 } } } };
  // The candidate manifest exists in the predecessor as unselected data, keeping
  // the configuration-only bridge scope distinct from authority changes.
  git(f.root, 'switch', '-c', 'foreign-predecessor', f.base);
  put(f.root, '.codex/gatekeeper/foreign.json', { version: 1, authorities: [
    ...files.map((path, index) => ({ id: index ? 'governance' : 'contract', repository: 'self', revision: 'authority-revision', path })),
    { id: 'foreign', repository: 'foreign/owner', revision: f.base, path: 'docs/extra.md' },
  ] });
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Synthetic unselected manifest');
  const foreignBase = git(f.root, 'rev-parse', 'HEAD');
  const foreignHead = commitOn(f, 'foreign-migration', { [selectionPath]: f.selection,
    [f.selection.policyPath]: nextPolicy }, foreignBase);
  await assert.rejects(preparePreviewLifecycle(spec(f, 'migration', foreignHead, null, null, foreignBase), f.root), /external authority/);
  const foreignA = commitOn(f, 'foreign-a', { 'app.txt': 'A under foreign selection\n' }, foreignHead);
  await assert.rejects(preparePreviewLifecycle(spec(f, 'review', foreignA, null, null, foreignHead), f.root), /external authority/);
  const plainPolicy = structuredClone(nextPolicy);
  plainPolicy.branches.main.authorityManifestPath = '.codex/gatekeeper/authorities.json';
  const addition = { grade: 'G0', authorityPath: files[0], promptPath: f.selection.promptPath, schemaPath: f.selection.schemaPath };
  const amendment = { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile: 'completed-block-v1',
    authorityId: 'contract', authorityPath: files[0], evidenceProducer: 'github-actions-attestation',
    tagNamespace: 'refs/tags/architecture-gatekeeper/amendments' };
  for (const [name, field, value] of [['activate-addition', 'ownerAddition', addition], ['activate-amendment', 'ownerAmendment', amendment]]) {
    const candidate = structuredClone(plainPolicy); candidate.branches.main[field] = value;
    const head = commitOn(f, name, { [selectionPath]: f.selection, [f.selection.policyPath]: candidate });
    await assert.rejects(preparePreviewLifecycle(spec(f, 'migration', head), f.root), /trusted acceptance route/);
  }
  for (const [name, value] of [['maxFileBytes', 131072], ['maxTotalBytes', 524288], ['maxPromptBytes', 1048576]]) {
    const candidate = structuredClone(plainPolicy); candidate.branches.main.authorityLimits[name] = value;
    const head = commitOn(f, `raise-${name}`, { [selectionPath]: f.selection, [f.selection.policyPath]: candidate });
    await assert.rejects(preparePreviewLifecycle(spec(f, 'migration', head), f.root), /raises legacy/);
  }
});

test('rejects changed authority in ordinary v1, unrelated B and unsupported integration', async t => {
  const f = fixture(t); const trigger = await triggerFor(f, 'BLOCK');
  const bad = commitOn(f, 'unrelated-b', { [files[0]]: 'Proposed rule\n', 'app.txt': 'Implementation mixed with B\n' });
  const record = { version: 1, kind: 'preview-amendment-record', baseSha: f.base, bSha: bad,
    triggerReceiptSha256: trigger.integritySha256, target: 'Rule', purpose: 'Synthetic' };
  await assert.rejects(preparePreviewLifecycle(spec(f, 'amendment', bad, trigger, record), f.root), /authority-only/);
  await assert.rejects(preparePreviewLifecycle(spec(f, 'review', bad), f.root), /ordinary v1/);
  const newlineHead = commitOn(f, 'newline-path-b', { [`${files[0]}\n`]: 'Unselected malicious path\n' });
  await assert.rejects(preparePreviewLifecycle(spec(f, 'amendment', newlineHead, trigger,
    { ...record, bSha: newlineHead }), f.root), /invalid repository path/);
  const b = await eligibleB(f, 'amendment', trigger);
  await assert.rejects(observePreviewLifecycle(b.receipt, b.head, f.root), /integration/);
  const final = await observePreviewLifecycle(b.receipt, integrate(f, b.head), f.root);
  const changed = commitOn(f, 'changed-placement', { [files[0]]: 'Changed later\n' }, final.targetSha);
  git(f.root, 'branch', '-f', 'main', changed);
  await assert.rejects(prepareFreshPreviewReview(final, changed, f.root), /placement/);
});
