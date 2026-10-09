import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { PREVIEW_PROFILE } from '@flair-agency/architecture-gatekeeper/preview-lifecycle';

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

export { git, files, selectionPath, ordinary, decision, put, gitSchema, fixture, spec, commitOn };
