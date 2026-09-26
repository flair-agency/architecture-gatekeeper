import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyReview, parseOwnerAdditionProcedure, renderReport } from '../src/ci-report.mjs';
import { validateOwnerAdditionEligibility, validateOwnerAdditionEligibilitySchema,
  validateOrdinaryOwnerDecision, validateOrdinaryOwnerDecisionSchema,
  resolveSingleOwnerAdditionAuthorityId } from '../src/owner-addition-ci.mjs';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = { type: 'object', additionalProperties: false,
  required: ['eligible', 'onlyMissingDecision', 'preservesExistingRules', 'noContradiction', 'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices', 'matchesOrdinaryOwnerDecision', 'summary'],
  properties: Object.fromEntries(['eligible', 'onlyMissingDecision', 'preservesExistingRules', 'noContradiction', 'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices', 'matchesOrdinaryOwnerDecision'].map(key => [key, { type: 'boolean' }]).concat([['summary', { type: 'string' }]])) };
const eligible = Object.fromEntries(schema.required.filter(key => key !== 'summary').map(key => [key, true]));
eligible.summary = 'Only the missing decision was added.';

function run(root, ...args) { return execFileSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim(); }
function write(root, path, content) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); }
function canonical(value) { return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value; }
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }

test('protected adapter verifies exact B and reports G0 separately from ordinary OWNER_DECISION', t => {
  const root = mkdtempSync(join(tmpdir(), 'owner-addition-ci-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  run(root, 'git', 'init', '-q');
  const oldAuthority = '# Architecture\n\nThe reporting owner is unselected.\n';
  const newAuthority = `${oldAuthority}\n## Reporting choice\n\nThe product owner owns reporting.\n`;
  const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimits: { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 },
    ownerAddition: { grade: 'G0', authorityPath: 'docs/architecture.md',
      promptPath: '.codex/gatekeeper/owner-addition.md', schemaPath: '.codex/gatekeeper/owner-addition.schema.json' },
  } } };
  write(root, 'docs/architecture.md', oldAuthority);
  write(root, '.codex/gatekeeper/ci-policy.json', JSON.stringify(policy));
  write(root, '.codex/gatekeeper/authorities.json', JSON.stringify({ version: 1, authorities: [
    { id: 'architecture-contract', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' },
  ] }));
  write(root, '.codex/gatekeeper/owner-addition.md', 'Review the missing reporting decision against this repository authority.');
  write(root, '.codex/gatekeeper/owner-addition.schema.json', JSON.stringify(schema));
  write(root, '.codex/gatekeeper/ordinary.schema.json', JSON.stringify({ type: 'object',
    required: ['decision', 'summary', 'ownerDecisionId'], properties: {
      decision: { type: 'string' }, summary: { type: 'string' }, ownerDecisionId: { type: 'string' },
    } }));
  run(root, 'git', 'add', '.'); run(root, 'git', 'commit', '-qm', 'protected base');
  const base = run(root, 'git', 'rev-parse', 'HEAD');
  write(root, 'docs/architecture.md', newAuthority);
  run(root, 'git', 'add', 'docs/architecture.md'); run(root, 'git', 'commit', '-qm', 'add missing decision');
  const head = run(root, 'git', 'rev-parse', 'HEAD');
  const record = { version: 1, repository: 'example/project', baseSha: base, headSha: head, policyRevision: base,
    authority: { id: 'architecture-contract', path: 'docs/architecture.md', previousSha256: sha256(oldAuthority), newSha256: sha256(newAuthority) },
    missingDecision: { id: 'reporting-owner', summary: 'Select the reporting owner.' }, purpose: 'Add the missing reporting ownership decision' };
  const recordPath = join(root, 'tag-message.json');
  writeFileSync(recordPath, `${JSON.stringify(canonical(record))}\n`);
  run(root, 'git', 'tag', '-a', `architecture-owner-addition/${head}`, '-F', recordPath, head);
  run(root, 'git', 'checkout', '-q', '--detach', base);
  const outputDir = join(root, 'output');
  const outputFile = join(root, 'output.txt');
  const env = { ...process.env, GITHUB_WORKSPACE: root, GITHUB_REPOSITORY: 'example/project', BASE_SHA: base,
    HEAD_SHA: head, BASE_BRANCH: 'main', POLICY_PATH: '.codex/gatekeeper/ci-policy.json',
    OWNER_AUTHORITY_PATH: 'docs/architecture.md', OWNER_PROMPT_PATH: '.codex/gatekeeper/owner-addition.md',
    OWNER_SCHEMA_PATH: '.codex/gatekeeper/owner-addition.schema.json',
    ORDINARY_SCHEMA_PATH: '.codex/gatekeeper/ordinary.schema.json',
    ORDINARY_DECISION: '{"decision":"OWNER_DECISION","ownerDecisionId":"reporting-owner","summary":"reporting owner is not selected"}',
    OUTPUT_DIR: outputDir, GITHUB_OUTPUT: outputFile };
  execFileSync(process.execPath, [join(sourceRoot, 'src/owner-addition-ci.mjs'), 'prepare'], { cwd: root, env });
  const output = readFileSync(outputFile, 'utf8');
  const procedure = parseOwnerAdditionProcedure(output.match(/^procedure_base64=(.+)$/m)[1], true);
  assert.equal(procedure.headSha, head);
  assert.equal(procedure.policyRevision, base);
  assert.equal(procedure.principalAuthentication, 'not_verified');
  const prompt = readFileSync(join(outputDir, 'eligibility-prompt.md'), 'utf8');
  assert.match(prompt, /Protected OWNER_ADDITION \/ G0 eligibility review/);
  assert.match(prompt, /The reporting owner is unselected/);
  assert.match(prompt, /The product owner owns reporting/);
  validateOwnerAdditionEligibilitySchema(JSON.parse(readFileSync(join(outputDir, 'eligibility.schema.json'), 'utf8')));
  validateOwnerAdditionEligibility(JSON.stringify(eligible), schema);
  const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: env.ORDINARY_DECISION, ownerAdditionSelected: true,
    ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure });
  assert.equal(classified.conclusion, 'OWNER_ADDITION_G0');
  const report = renderReport(classified, { ownerAdditionProcedure: procedure });
  assert.match(report, /OWNER_ADDITION \/ G0/);
  assert.match(report, /Tag actor or owner identity was not authenticated/);
  assert.match(report, new RegExp(procedure.tagObjectOid));
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: '{"decision":"BLOCK","summary":"conflict"}', ownerAdditionSelected: true,
    ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure }).conclusion, 'BLOCK');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: '{"decision":"OWNER_DECISION","ownerDecisionId":"reporting-owner","summary":"choice","gates":{"other":{"decision":"BLOCK"}}}', ownerAdditionSelected: true,
    ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure }).conclusion, 'OWNER_DECISION');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: '{"decision":"OWNER_DECISION","ownerDecisionId":"unrelated-owner","summary":"other choice"}', ownerAdditionSelected: true,
    ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure }).conclusion, 'OWNER_DECISION');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: '{"decision":"OWNER_DECISION","summary":"unidentified choice"}', ownerAdditionSelected: true,
    ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure }).conclusion, 'OWNER_DECISION');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: '{"decision":"PASS","summary":"eligible through normal review"}', ownerAdditionSelected: true,
    ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure }).conclusion, 'PASS');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: '{"decision":"OWNER_DECISION","summary":"missing"}', ownerAdditionSelected: true,
    ownerAdditionResult: 'failure', ownerAdditionEligibility: '', ownerAdditionProcedure: null }).conclusion, 'OWNER_DECISION');
  assert.throws(() => validateOwnerAdditionEligibility(JSON.stringify({ ...eligible, noUnsupportedCompletionClaim: false }), schema), /noUnsupportedCompletionClaim/);
  const strongerSchema = { ...schema, required: [...schema.required, 'consumerSpecific'],
    properties: { ...schema.properties, consumerSpecific: { type: 'boolean' } } };
  assert.throws(() => validateOwnerAdditionEligibility(JSON.stringify(eligible), strongerSchema), /complete selected schema/);
  assert.throws(() => validateOwnerAdditionEligibility(JSON.stringify({ ...eligible, consumerSpecific: false }), strongerSchema), /consumerSpecific/);
  assert.throws(() => validateOwnerAdditionEligibilitySchema({ ...schema, required: ['eligible'] }), /require every declared property/);
  assert.throws(() => validateOrdinaryOwnerDecisionSchema({ type: 'object', required: ['decision'], properties: {} }), /ownerDecisionId/);
  validateOrdinaryOwnerDecisionSchema(JSON.parse(readFileSync(join(root, '.codex/gatekeeper/ordinary.schema.json'), 'utf8')));
  assert.throws(() => validateOrdinaryOwnerDecision('{"decision":"OWNER_DECISION","ownerDecisionId":"unrelated-owner","summary":"other"}', 'reporting-owner'), /exact missing decision/);
  assert.throws(() => validateOrdinaryOwnerDecision('{"decision":"OWNER_DECISION","summary":"other"}', 'reporting-owner'), /exact missing decision/);
});

test('G0 applies protected file and total limits to both authority snapshots', t => {
  const root = mkdtempSync(join(tmpdir(), 'owner-addition-limits-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  run(root, 'git', 'init', '-q');
  const maxFileBytes = 256;
  const maxTotalBytes = 192;
  const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimits: { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes,
      maxTotalBytes, maxPromptBytes: 524288 },
    ownerAddition: { grade: 'G0', authorityPath: 'docs/architecture.md',
      promptPath: '.codex/gatekeeper/owner-addition.md', schemaPath: '.codex/gatekeeper/owner-addition.schema.json' },
  } } };
  const oldAuthority = `# Architecture\n\n${'a'.repeat(220)}\n`;
  const newAuthority = `# Architecture\n\n${'b'.repeat(270)}\n`;
  write(root, 'docs/architecture.md', oldAuthority);
  write(root, '.codex/gatekeeper/ci-policy.json', JSON.stringify(policy));
  write(root, '.codex/gatekeeper/authorities.json', JSON.stringify({ version: 1, authorities: [
    { id: 'architecture-contract', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' },
  ] }));
  write(root, '.codex/gatekeeper/owner-addition.md', 'Review the missing decision.');
  write(root, '.codex/gatekeeper/owner-addition.schema.json', JSON.stringify(schema));
  write(root, '.codex/gatekeeper/ordinary.schema.json', JSON.stringify({ type: 'object',
    required: ['decision', 'summary', 'ownerDecisionId'], properties: {
      decision: { type: 'string' }, summary: { type: 'string' }, ownerDecisionId: { type: 'string' },
    } }));
  run(root, 'git', 'add', '.'); run(root, 'git', 'commit', '-qm', 'protected base');
  const base = run(root, 'git', 'rev-parse', 'HEAD');
  write(root, 'docs/architecture.md', newAuthority);
  run(root, 'git', 'add', 'docs/architecture.md'); run(root, 'git', 'commit', '-qm', 'oversized decision');
  const head = run(root, 'git', 'rev-parse', 'HEAD');
  const outputDir = join(root, 'output');
  const env = { ...process.env, GITHUB_WORKSPACE: root, GITHUB_REPOSITORY: 'example/project', BASE_SHA: base,
    HEAD_SHA: head, BASE_BRANCH: 'main', POLICY_PATH: '.codex/gatekeeper/ci-policy.json',
    OWNER_AUTHORITY_PATH: 'docs/architecture.md', OWNER_PROMPT_PATH: '.codex/gatekeeper/owner-addition.md',
    OWNER_SCHEMA_PATH: '.codex/gatekeeper/owner-addition.schema.json',
    ORDINARY_SCHEMA_PATH: '.codex/gatekeeper/ordinary.schema.json',
    ORDINARY_DECISION: '{"decision":"OWNER_DECISION","ownerDecisionId":"missing-choice","summary":"missing"}',
    OUTPUT_DIR: outputDir, GITHUB_OUTPUT: join(root, 'output.txt') };
  assert.ok(Buffer.byteLength(oldAuthority) <= maxFileBytes);
  assert.ok(Buffer.byteLength(oldAuthority) + Buffer.byteLength(newAuthority) > maxTotalBytes);
  assert.ok(Buffer.byteLength(newAuthority) > maxFileBytes);
  assert.throws(() => execFileSync(process.execPath, [join(sourceRoot, 'src/owner-addition-ci.mjs'), 'prepare'],
    { cwd: root, env }), /Protected file has invalid size: docs\/architecture\.md/);

  // A protected limit must apply to the base snapshot too, even when B makes it smaller.
  const oversizedBase = `# Architecture\n\n${'c'.repeat(270)}\n`;
  write(root, 'docs/architecture.md', oversizedBase);
  run(root, 'git', 'add', 'docs/architecture.md'); run(root, 'git', 'commit', '-qm', 'oversized protected base');
  const oversizedBaseSha = run(root, 'git', 'rev-parse', 'HEAD');
  write(root, 'docs/architecture.md', oldAuthority);
  run(root, 'git', 'add', 'docs/architecture.md'); run(root, 'git', 'commit', '-qm', 'smaller proposed authority');
  const smallerHeadSha = run(root, 'git', 'rev-parse', 'HEAD');
  assert.throws(() => execFileSync(process.execPath, [join(sourceRoot, 'src/owner-addition-ci.mjs'), 'prepare'],
    { cwd: root, env: { ...env, BASE_SHA: oversizedBaseSha, HEAD_SHA: smallerHeadSha } }),
  /Protected file has invalid size: docs\/architecture\.md/);
});

test('G0 rejects a protected Authority Set with another member', t => {
  const root = mkdtempSync(join(tmpdir(), 'owner-addition-authority-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  run(root, 'git', 'init', '-q');
  const selected = { authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimitsBase64: Buffer.from(JSON.stringify({ maxManifestBytes: 16384, maxMembers: 16,
      maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 })).toString('base64') };
  const member = { id: 'architecture-contract', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' };
  write(root, 'docs/architecture.md', '# Architecture\n');
  write(root, 'docs/other.md', '# Other authority\n');
  write(root, selected.authorityManifestPath, JSON.stringify({ version: 1, authorities: [member,
    { id: 'other-authority', repository: 'self', revision: 'authority-revision', path: 'docs/other.md' }] }));
  run(root, 'git', 'add', '.'); run(root, 'git', 'commit', '-qm', 'two protected authorities');
  const base = run(root, 'git', 'rev-parse', 'HEAD');
  assert.throws(() => resolveSingleOwnerAdditionAuthorityId(root, base, selected, member.path), /only its affected self member/);
  write(root, selected.authorityManifestPath, JSON.stringify({ version: 1, authorities: [member] }));
  run(root, 'git', 'add', '.'); run(root, 'git', 'commit', '-qm', 'single protected authority');
  assert.equal(resolveSingleOwnerAdditionAuthorityId(root, run(root, 'git', 'rev-parse', 'HEAD'), selected, member.path), member.id);
});
