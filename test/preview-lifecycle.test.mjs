import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, copyFileSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { PREVIEW_PROFILE, preparePreviewLifecycle, completePreviewLifecycle, validatePreviewReceipt, previewReceiptBytes } from '@flair-agency/architecture-gatekeeper/preview-lifecycle';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const files = ['docs/authority.md', 'docs/governance.md'];
const selectionPath = '.codex/gatekeeper/preview-lifecycle.json';
const ordinary = semanticDecision => ({ semanticDecision, checks: { predecessorAuthorized: true } });
const decision = (value = 'PASS', ids = false) => ({ decision: value, summary: 'Synthetic model response; no semantic correctness claim.',
  authorityFiles: files, ...(ids ? { authorityIds: ['contract', 'governance'] } : {}), valid: true, ...(value === 'OWNER_DECISION' ? { ownerDecisionId: 'choice-1', summary: 'Missing choice-1: add the missing new decision only.' } : {}) });
function put(root, file, value) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
}
function gitSchema(root, path) { return readFileSync(join(root, path), 'utf8'); }
function fixture(t, selected = true, ownerAmendment = false, sharedValidator = false) {
  const root = mkdtempSync(join(tmpdir(), 'preview-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  const selection = { version: 1, profile: PREVIEW_PROFILE, repository: 'fixture/example', targetBranch: 'main',
    eligibilitySchemaPath: '.codex/gatekeeper/eligibility.schema.json', eligibilityValidationPath: sharedValidator ? '.codex/gatekeeper/rules.json' : '.codex/gatekeeper/eligibility-rules.json', amendmentTriggerProfile: ownerAmendment ? 'completed-owner-decision-v1' : 'completed-block-v1',
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
      authorityFiles: { type: 'array', items: { type: 'string' } }, ownerDecisionId: { type: 'string' }, authorityIds: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } } });
  const eligibilitySchema = JSON.parse(gitSchema(root, selection.schemaPath)); eligibilitySchema.properties.decision.enum = ['ELIGIBLE', 'INELIGIBLE'];
  put(root, selection.eligibilitySchemaPath, eligibilitySchema);
  put(root, selection.eligibilityValidationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'Synthetic mandatory consumer validator' }] });
  put(root, selection.validationPath, { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' },
    require: { path: '/valid', equals: true }, message: 'Synthetic mandatory consumer validator' }, ...(sharedValidator ? [{ when: { path: '/decision', equals: 'ELIGIBLE' }, require: { path: '/valid', equals: true }, message: 'Shared B validator' }] : [])] });
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
function integrate(f, head, receipt) {
  const receiptSha256 = createHash('sha256').update(previewReceiptBytes(receipt)).digest('hex');
  git(f.root, 'switch', 'main'); git(f.root, 'merge', '--no-ff', '-m', `Synthetic integration\n\nAGK-Preview-Receipt-v1: sha256:${receiptSha256}`, head);
  return git(f.root, 'rev-parse', 'HEAD');
}
test('ordinary materializes added, deleted and empty files with exact null-versus-empty semantics', async t => {
  const f = fixture(t);
  git(f.root, 'switch', '-c', 'ordinary-materialization', f.base);
  put(f.root, 'new.txt', ''); put(f.root, 'app.txt', '');
  put(f.root, 'invalid.bin', Buffer.from([0xff]));
  // put serializes nonstrings; use exact invalid bytes for the negative boundary.
  writeFileSync(join(f.root, 'invalid.bin'), Buffer.from([0xff]));
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Invalid UTF8 candidate');
  const invalid = git(f.root, 'rev-parse', 'HEAD');
  await assert.rejects(preparePreviewLifecycle(spec(f, 'review', invalid), f.root), /encoded data|UTF/);
  unlinkSync(join(f.root, 'invalid.bin')); unlinkSync(join(f.root, 'app.txt'));
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Added empty and deleted ordinary paths');
  const head = git(f.root, 'rev-parse', 'HEAD');
  const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
  assert.deepEqual(request.spec.mode, 'review');
  const task = JSON.parse(request.prompt.split('Bound task:\n')[1].split('\nReturn only')[0]);
  assert.equal(task.changes.find(change => change.path === 'new.txt').before, null);
  assert.equal(task.changes.find(change => change.path === 'new.txt').after, '');
  assert.equal(task.changes.find(change => change.path === 'app.txt').before, 'Original application\n');
  assert.equal(task.changes.find(change => change.path === 'app.txt').after, null);
  await completePreviewLifecycle(request, ordinary(decision()), f.root);
});

test('runtime identity binds nested emitted modules and invalidates stale requests and receipts', async t => {
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@flair-agency/architecture-gatekeeper/preview-lifecycle'))));
  const runtimeRoot = mkdtempSync(join(tmpdir(), 'preview-runtime-layout-'));
  t.after(() => rmSync(runtimeRoot, { recursive: true, force: true }));
  cpSync(join(packageRoot, 'dist'), join(runtimeRoot, 'dist'), { recursive: true });
  copyFileSync(join(packageRoot, 'package.json'), join(runtimeRoot, 'package.json'));
  const runtime = await import(pathToFileURL(join(runtimeRoot, 'dist/preview-lifecycle.mjs')).href);
  const f = fixture(t);
  const head = commitOn(f, 'runtime-identity-nested-module', { 'app.txt': 'Runtime identity fixture\n' });
  const request = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const nestedPath = 'owner-addition/owner-addition-validation.mjs';
  assert.ok(request.runtime.files['preview-lifecycle.mjs']);
  assert.ok(request.runtime.files['../package.json']);
  assert.ok(request.runtime.files[nestedPath]);
  assert.ok(readdirSync(join(runtimeRoot, 'dist')).filter(file => file.endsWith('.mjs')).every(file => request.runtime.files[file]));
  const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(receipt, f.root);

  const facadePath = join(runtimeRoot, 'dist/owner-addition-validation.mjs');
  const previewPath = join(runtimeRoot, 'dist/preview-lifecycle.mjs');
  const packagePath = join(runtimeRoot, 'package.json');
  const facadeBefore = createHash('sha256').update(readFileSync(facadePath)).digest('hex');
  const previewBefore = createHash('sha256').update(readFileSync(previewPath)).digest('hex');
  const packageBefore = createHash('sha256').update(readFileSync(packagePath)).digest('hex');
  appendFileSync(join(runtimeRoot, 'dist', nestedPath), '\n// isolated runtime-byte mutation\n');
  const changedRequest = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  assert.notEqual(changedRequest.runtime.files[nestedPath], request.runtime.files[nestedPath]);
  assert.equal(createHash('sha256').update(readFileSync(facadePath)).digest('hex'), facadeBefore);
  assert.equal(createHash('sha256').update(readFileSync(previewPath)).digest('hex'), previewBefore);
  assert.equal(createHash('sha256').update(readFileSync(packagePath)).digest('hex'), packageBefore);
  await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root), /request differs from immutable predecessor inputs/);
  await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root), /request differs from immutable predecessor inputs/);
  const changedReceipt = await runtime.completePreviewLifecycle(changedRequest, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(changedReceipt, f.root);

  const flatRoot = mkdtempSync(join(tmpdir(), 'preview-runtime-flat-layout-'));
  t.after(() => rmSync(flatRoot, { recursive: true, force: true }));
  cpSync(join(packageRoot, 'dist'), join(flatRoot, 'dist'), { recursive: true });
  copyFileSync(join(packageRoot, 'package.json'), join(flatRoot, 'package.json'));
  writeFileSync(join(flatRoot, 'dist/owner-addition-validation.mjs'), readFileSync(join(flatRoot, 'dist', nestedPath)));
  rmSync(join(flatRoot, 'dist/owner-addition'), { recursive: true });
  const flatRuntime = await import(pathToFileURL(join(flatRoot, 'dist/preview-lifecycle.mjs')).href);
  const flatRequest = await flatRuntime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const expectedFlatPaths = readdirSync(join(flatRoot, 'dist')).filter(file => file.endsWith('.mjs')).sort();
  assert.equal(flatRequest.runtime.nodeVersion, process.version);
  assert.deepEqual(Object.keys(flatRequest.runtime.files).filter(file => file !== '../package.json').sort(), expectedFlatPaths);
  assert.equal(flatRequest.runtime.files['../package.json'], packageBefore);
  const flatReceipt = await flatRuntime.completePreviewLifecycle(flatRequest, ordinary(decision()), f.root);
  await flatRuntime.validatePreviewReceipt(flatReceipt, f.root);
});

test('ordinary diff ignores configured textconv during preparation and receipt revalidation', async t => {
  const f = fixture(t);
  put(f.root, '.gitattributes', 'app.txt diff=poison\n');
  git(f.root, 'add', '.gitattributes'); git(f.root, 'commit', '-m', 'Configure a synthetic textconv driver');
  f.base = git(f.root, 'rev-parse', 'HEAD');
  const converterDir = mkdtempSync(join(tmpdir(), 'preview-textconv-'));
  t.after(() => rmSync(converterDir, { recursive: true, force: true }));
  const marker = join(converterDir, 'converter-invoked');
  const converter = join(converterDir, 'converter.cjs');
  writeFileSync(converter, `const fs = require('node:fs');\nfs.appendFileSync(${JSON.stringify(marker)}, 'called\\n');\nprocess.stdout.write(fs.readFileSync(process.argv.at(-1)));\n`);
  git(f.root, 'config', 'diff.poison.textconv', `${JSON.stringify(process.execPath)} ${JSON.stringify(converter)}`);
  const head = commitOn(f, 'ordinary-no-textconv', { 'app.txt': 'Candidate reviewed as committed bytes\n' });

  git(f.root, 'diff', '--no-ext-diff', '--textconv', '--no-renames', f.base, head);
  assert.equal(existsSync(marker), true, 'fixture textconv driver must be active');
  rmSync(marker);
  const expectedDiff = execFileSync('git', ['-C', f.root, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', f.base, head],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(existsSync(marker), false);

  const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const taskPayload = JSON.parse(request.prompt.split('Bound task:\n')[1].split('\nReturn only')[0]);
  assert.equal(taskPayload.diff, expectedDiff);
  assert.equal(existsSync(marker), false, 'preparation must not invoke the configured converter');
  const receipt = await completePreviewLifecycle(request, ordinary(decision()), f.root);
  assert.equal(existsSync(marker), false, 'completion request rebuilding must not invoke the converter');
  await validatePreviewReceipt(receipt, f.root);
  assert.equal(existsSync(marker), false, 'receipt revalidation must not invoke the converter');
});

test('ordinary diff preserves trailing whitespace and final newlines through receipt validation', async t => {
  const f = fixture(t);
  const reviewedBytes = 'Updated final line with meaningful trailing spaces   \n\n';
  const head = commitOn(f, 'ordinary-trailing-whitespace', { 'app.txt': reviewedBytes });
  const expectedDiff = execFileSync('git', ['-C', f.root, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', f.base, head],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const taskPayload = JSON.parse(request.prompt.split('Bound task:\n')[1].split('\nReturn only')[0]);
  assert.equal(taskPayload.changes.find(change => change.path === 'app.txt').after, reviewedBytes);
  assert.equal(taskPayload.diff, expectedDiff);
  assert.equal(taskPayload.diff.endsWith('\n'), true);
  assert.match(taskPayload.diff, /\+Updated final line with meaningful trailing spaces   \n/);
  const receipt = await completePreviewLifecycle(request, ordinary(decision()), f.root);
  await validatePreviewReceipt(receipt, f.root);
});

test('ordinary instructions enumerate the complete selected authority without changing its schema or validator', async t => {
  const legacy = fixture(t);
  const legacyHead = commitOn(legacy, 'ordinary-complete-legacy-authority', { 'app.txt': 'Review against every selected file\n' });
  const legacyRequest = await preparePreviewLifecycle(spec(legacy, 'review', legacyHead), legacy.root);
  const legacySchema = JSON.parse(gitSchema(legacy.root, legacy.selection.schemaPath));
  assert.deepEqual(legacyRequest.schema.$defs.semanticDecision, legacySchema);
  const legacyInstructions = legacyRequest.prompt.split('Return semanticDecision under the unchanged predecessor schema.')[1].split('Bound task:')[0];
  assert.match(legacyInstructions, /Report every selected predecessor Authority Set member exactly once/);
  assert.match(legacyInstructions, /including members that do not directly determine the decision/);
  assert.match(legacyInstructions, /authorityFiles/);
  for (const file of files) assert.equal(legacyInstructions.split(`path=${file}`).length - 1, 1);
  assert.doesNotMatch(legacyInstructions, /ownerDecisionId|choice-1|local-output-v1/);
  await assert.rejects(completePreviewLifecycle(legacyRequest,
    ordinary({ ...decision(), authorityFiles: [files[0]] }), legacy.root), /complete predecessor authority/);
  await completePreviewLifecycle(legacyRequest, ordinary(decision()), legacy.root);

  const manifested = fixture(t);
  const schemaPath = manifested.selection.schemaPath;
  const memberSchema = JSON.parse(gitSchema(manifested.root, schemaPath));
  memberSchema.required = ['decision', 'summary', 'authorityIds', 'valid'];
  delete memberSchema.properties.authorityFiles;
  memberSchema.properties.literalMarker = { enum: [{ $ref: '#' }] };
  const referenceSchema = { $defs: { result: memberSchema, encodedResult: { $ref: '#%2F$defs%2Fresult' } }, $ref: '#/$defs/result' };
  put(manifested.root, schemaPath, referenceSchema);
  put(manifested.root, manifested.selection.policyPath, { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: manifested.branch.model, reasoningEffort: manifested.branch.reasoningEffort,
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: {
      maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288,
    },
  } } });
  git(manifested.root, 'add', '.'); git(manifested.root, 'commit', '-m', 'Select complete manifest and ID schema');
  manifested.base = git(manifested.root, 'rev-parse', 'HEAD');
  const memberHead = commitOn(manifested, 'ordinary-complete-member-ids', { 'app.txt': 'Review both selected members\n' });
  const memberRequest = await preparePreviewLifecycle(spec(manifested, 'review', memberHead), manifested.root);
  const selectedSchemaBytes = readFileSync(join(manifested.root, schemaPath));
  assert.deepEqual(memberRequest.schema.$defs.semanticDecision.$defs.result, memberSchema);
  assert.equal(memberRequest.schema.$defs.semanticDecision.$ref, '#/$defs/semanticDecision/$defs/result');
  assert.equal(memberRequest.schema.$defs.semanticDecision.$defs.encodedResult.$ref, '#/$defs/semanticDecision%2F$defs%2Fresult');
  assert.deepEqual(memberRequest.schema.$defs.semanticDecision.$defs.result.properties.literalMarker.enum, [{ $ref: '#' }]);
  assert.equal(memberRequest.inputs.find(input => input.path === schemaPath).sha256, createHash('sha256').update(selectedSchemaBytes).digest('hex'));
  const memberInstructions = memberRequest.prompt.split('Return semanticDecision under the unchanged predecessor schema.')[1].split('Bound task:')[0];
  assert.match(memberInstructions, /authorityIds/);
  assert.match(memberInstructions, /id=contract, path=docs\/authority\.md/);
  assert.match(memberInstructions, /id=governance, path=docs\/governance\.md/);
  assert.doesNotMatch(memberInstructions, /ownerDecisionId|local-output-v1|choice-1/);
  const memberDecision = { decision: 'PASS', summary: 'Synthetic complete-set response.', authorityIds: ['contract', 'governance'], valid: true };
  await assert.rejects(completePreviewLifecycle(memberRequest, ordinary({ ...memberDecision, authorityIds: ['contract'] }), manifested.root), /complete Authority ID set/);
  await completePreviewLifecycle(memberRequest, ordinary(memberDecision), manifested.root);

  const selfReference = fixture(t);
  put(selfReference.root, selfReference.selection.schemaPath, { $ref: '#' });
  git(selfReference.root, 'add', '.'); git(selfReference.root, 'commit', '-m', 'Select root-reference response schema');
  selfReference.base = git(selfReference.root, 'rev-parse', 'HEAD');
  const selfHead = commitOn(selfReference, 'ordinary-root-reference', { 'app.txt': 'Exercise root reference\n' });
  const selfRequest = await preparePreviewLifecycle(spec(selfReference, 'review', selfHead), selfReference.root);
  await assert.rejects(completePreviewLifecycle(selfRequest, ordinary(decision()), selfReference.root), /recursive schema evaluation repeated without instance progress/);

  for (const [name, ref, expected] of [
    ['invalid-local-anchor', '#invalid', /must be a local URI fragment JSON Pointer/],
    ['invalid-percent-fragment', '#%ZZ', /malformed percent encoding/],
  ]) {
    const invalidReference = fixture(t);
    put(invalidReference.root, invalidReference.selection.schemaPath, { $ref: ref });
    git(invalidReference.root, 'add', '.'); git(invalidReference.root, 'commit', '-m', `Select ${name} schema`);
    invalidReference.base = git(invalidReference.root, 'rev-parse', 'HEAD');
    const invalidHead = commitOn(invalidReference, name, { 'app.txt': 'Reject malformed local reference\n' });
    const invalidRequest = await preparePreviewLifecycle(spec(invalidReference, 'review', invalidHead), invalidReference.root);
    await assert.rejects(completePreviewLifecycle(invalidRequest, ordinary(decision()), invalidReference.root), expected);
  }
});


test('legacy predecessor authority retains exact BOM bytes and decoded content', async t => {
  const predecessor = fixture(t);
  const authorityPath = files[0];
  const predecessorBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Canonical authority with BOM.\n')]);
  writeFileSync(join(predecessor.root, authorityPath), predecessorBytes);
  git(predecessor.root, 'add', authorityPath); git(predecessor.root, 'commit', '-m', 'Record predecessor authority bytes');
  predecessor.base = git(predecessor.root, 'rev-parse', 'HEAD');
  const predecessorHead = commitOn(predecessor, 'review-bom-authority', { 'app.txt': 'Review BOM authority\n' });
  const predecessorRequest = await preparePreviewLifecycle(spec(predecessor, 'review', predecessorHead), predecessor.root);
  const predecessorMembers = JSON.parse(predecessorRequest.prompt.split('Full immutable predecessor authority:\n')[1].split('\nExplicit ')[0]);
  const predecessorMember = predecessorMembers.find(member => member.path === authorityPath);
  assert.equal(predecessorMember.byteLength, predecessorBytes.length);
  assert.equal(predecessorMember.sha256, createHash('sha256').update(predecessorBytes).digest('hex'));
  assert.equal(predecessorMember.content, '\uFEFFCanonical authority with BOM.\n');
  await completePreviewLifecycle(predecessorRequest, ordinary(decision()), predecessor.root);
});

test('ordinary mode records PASS, BLOCK and OWNER_DECISION without promoting escalation', async t => {
  for (const result of ['PASS', 'BLOCK', 'OWNER_DECISION']) {
    const f = fixture(t);
    const head = commitOn(f, `ordinary-${result.toLowerCase()}`, { 'app.txt': `Candidate for ${result}\n` });
    const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
    const receipt = await completePreviewLifecycle(request, ordinary(decision(result)), f.root);
    assert.equal(receipt.decision.decision, result);
    assert.equal(receipt.eligibility, 'NOT_APPLICABLE');
    assert.equal(receipt.adoption, 'PENDING');
    assert.equal(receipt.canonical, 'PENDING');
    await validatePreviewReceipt(receipt, f.root);
  }
});

test('ordinary mode rejects later routes before request creation and on receipt revalidation', async t => {
  const f = fixture(t);
  const head = commitOn(f, 'unsupported-route', { 'app.txt': 'Candidate\n' });
  for (const mode of ['migration']) {
    await assert.rejects(preparePreviewLifecycle(spec(f, mode, head, {}, {}), f.root), /unsupported spec/);
  }
  const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const receipt = await completePreviewLifecycle(request, ordinary(decision()), f.root);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const seal = value => {
    const unsigned = { ...value }; delete unsigned.integritySha256;
    return { ...unsigned, integritySha256: createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex') };
  };
  const laterRequest = structuredClone(receipt.request);
  laterRequest.spec.mode = 'amendment';
  const sealedRequest = seal(laterRequest);
  const laterReceipt = seal({ ...receipt, request: sealedRequest });
  await assert.rejects(validatePreviewReceipt(laterReceipt, f.root), /completed trigger and external record/);
});

test('ordinary completion enforces schema and selected deterministic validator', async t => {
  const f = fixture(t);
  const head = commitOn(f, 'ordinary-validator', { 'app.txt': 'Candidate\n' });
  const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
  await assert.rejects(completePreviewLifecycle(request, ordinary({ ...decision(), valid: false }), f.root), /validator/);
  await assert.rejects(completePreviewLifecycle(request, ordinary({ ...decision(), authorityFiles: [files[0]] }), f.root), /complete predecessor authority/);
  await assert.rejects(completePreviewLifecycle(request, { semanticDecision: decision(), checks: { predecessorAuthorized: false } }, f.root), /did not authorize/);
});

test('Git replacement refs cannot change the exact predecessor or candidate diff snapshot', async t => {
  const f = fixture(t);
  const head = commitOn(f, 'ordinary-original-diff', { 'app.txt': 'Candidate under original base\n' });
  const replacement = commitOn(f, 'replace-predecessor-commit', { [files[0]]: 'Spoofed replacement authority\n' }, f.base);
  git(f.root, 'replace', f.base, replacement);
  const request = await preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const task = JSON.parse(request.prompt.split('Bound task:\n')[1].split('\nReturn only')[0]);
  assert.deepEqual(task.changes.map(change => change.path), ['app.txt']);
  const authorities = JSON.parse(request.prompt.split('Full immutable predecessor authority:\n')[1].split('\nExplicit ')[0]);
  assert.match(authorities.find(member => member.path === files[0]).content, /Existing rule: keep selected predecessor rules/);
  assert.doesNotMatch(authorities.find(member => member.path === files[0]).content, /Spoofed replacement/);
});

test('manifested resulting Authority Set byte limit counts candidate BOM bytes', async t => {
  const f = fixture(t);
  const selectedBytes = files.map(file => readFileSync(join(f.root, file)));
  const maxTotalBytes = selectedBytes.reduce((total, bytes) => total + bytes.length, 0);
  const manifestPath = '.codex/gatekeeper/authorities.json';
  put(f.root, manifestPath, { version: 1, authorities: files.map((path, index) => ({ id: index ? 'governance' : 'contract', repository: 'self', revision: 'authority-revision', path })) });
  put(f.root, f.selection.schemaPath, { type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityIds', 'valid'], properties: {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' }, authorityIds: { type: 'array', items: { type: 'string' } }, valid: { type: 'boolean' } } });
  put(f.root, f.selection.policyPath, { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityManifestPath: manifestPath,
    authorityLimits: { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes, maxPromptBytes: 524288 },
  } } });
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'Select manifested byte limit'); f.base = git(f.root, 'rev-parse', 'HEAD');
  git(f.root, 'switch', '-c', 'manifested-bom-overflow', f.base);
  writeFileSync(join(f.root, files[0]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), selectedBytes[0]]));
  git(f.root, 'add', files[0]); git(f.root, 'commit', '-m', 'Exceed raw authority total by BOM bytes');
  const head = git(f.root, 'rev-parse', 'HEAD');
  await assert.rejects(preparePreviewLifecycle(spec(f, 'review', head), f.root), /resulting full Authority Set exceeds selected bounds/);
});
