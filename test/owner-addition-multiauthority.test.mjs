import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateJsonSchema } from '../dist/json-schema.mjs';
import { MULTI_AUTHORITY_PROFILE, validateAuthorityLimits } from '../dist/authority-set.mjs';
import { prepareAuthoritySet } from '../dist/prepare-authority-set.mjs';
import { resolveCiPolicy } from '../dist/resolve-ci-policy.mjs';
import { validatePreparedAuthorityDecision } from '../dist/validate-authority-set-decision.mjs';
import { prepareMultiAuthorityAddition, validateMultiAuthorityEligibility,
  validateMultiAuthorityEligibilitySchema } from '../dist/owner-addition-multiauthority.mjs';
import { classifyReview, parseOwnerAdditionProcedure, renderReport } from '../dist/ci-report.mjs';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(join(sourceRoot, 'examples/owner-addition-v2/eligibility.schema.json'), 'utf8'));
const limits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 262144, maxTotalBytes: 524288, maxPromptBytes: 1048576 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env,
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(root, path, bytes) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); }
function policy() { return { version: 4, default: { mode: 'local-only' }, branches: { main: {
  mode: 'enforced', model: 'fixture-model', reasoningEffort: 'low', authorityManifestPath: '.gate/authorities.json', authorityLimits: { ...limits },
  ownerAddition: { version: 2, grade: 'G0', authorityId: 'architecture', authorityPath: 'docs/architecture.md', promptPath: '.gate/eligibility.md', schemaPath: '.gate/eligibility.json' },
} } }; }

async function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'multi-addition-'));
  const runnerTemp = mkdtempSync(join(tmpdir(), 'multi-addition-runner-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(runnerTemp, { recursive: true, force: true }); });
  git(root, 'init', '-q');
  const selectedPolicy = policy();
  Object.assign(selectedPolicy.branches.main.authorityLimits, options.limits);
  options.policy?.(selectedPolicy);
  const policyBytes = Buffer.from(JSON.stringify(selectedPolicy));
  const selected = resolveCiPolicy(selectedPolicy, 'main');
  const authority = '# Architecture\nThe reporting owner is unselected.\n';
  const after = options.after || `${authority}\nThe product owner owns reporting.\n`;
  const other = options.other || '# Privacy\nReports must never disclose secrets.\n';
  const manifest = { version: 1, authorities: [
    { id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' },
    { id: 'privacy', repository: 'self', revision: 'authority-revision', path: 'docs/privacy.md' },
  ] };
  const extraMemberCount = (options.memberCount ?? 2) - manifest.authorities.length;
  for (let index = 0; index < extraMemberCount; index++) {
    const path = `docs/r${String(index).padStart(2, '0')}-${'x'.repeat(227)}.md`;
    manifest.authorities.push({ id: `long-rule-${String(index).padStart(2, '0')}`, repository: 'self',
      revision: 'authority-revision', path });
    write(root, path, `# Long path rule ${index}\nRetain this protected requirement.\n`);
  }
  if (options.external) manifest.authorities.push({ id: 'external-rule', repository: 'other/authority', revision: 'c'.repeat(40), path: 'docs/rule.md' });
  options.manifest?.(manifest);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  write(root, 'docs/architecture.md', authority);
  write(root, 'docs/privacy.md', other);
  write(root, '.gate/policy.json', policyBytes);
  write(root, '.gate/authorities.json', manifestBytes);
  write(root, '.gate/eligibility.md', options.prompt || 'Check this candidate against every base authority.');
  write(root, '.gate/eligibility.json', JSON.stringify(schema));
  write(root, '.gate/ordinary.json', JSON.stringify({ type: 'object', required: ['decision', 'summary', 'ownerDecisionId', 'authorityIds', 'authoritySetDigest'], properties: {
    decision: { type: 'string' }, summary: { type: 'string' }, ownerDecisionId: { type: 'string' },
    authorityIds: { type: 'array', minItems: 1, items: { type: 'string' } }, authoritySetDigest: { type: 'string' },
  } }));
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'previous protected base');
  const base = git(root, 'rev-parse', 'HEAD');
  const fetchExternal = options.external ? async request => ({ repository: request.repository, resolvedCommit: request.revision,
    path: request.path, type: 'file', content: Buffer.from('# External rule\nKeep acquisition separate.\n') }) : undefined;
  const prepared = await prepareAuthoritySet({ manifestBytes, selfRepository: 'example/project', selfRoot: root, authorityRevision: base,
    limits: selectedPolicy.branches.main.authorityLimits, profile: MULTI_AUTHORITY_PROFILE, outputDir: join(root, 'ordinary-inputs'), fetchExternal,
    affectedAuthority: { id: selected.ownerAdditionAuthorityId, path: selected.ownerAdditionAuthorityPath } });
  const provenance = prepared.provenance;
  const ordinary = { decision: 'OWNER_DECISION', ownerDecisionId: 'reporting-owner', summary: 'The reporting owner is unselected.',
    authorityIds: provenance.members.map(member => member.id), authoritySetDigest: provenance.setDigest };
  write(root, 'docs/architecture.md', after);
  for (const [path, content] of Object.entries(options.extraChanges || {})) write(root, path, content);
  git(root, 'add', 'docs', '.gate'); git(root, 'commit', '-qm', 'candidate B');
  const head = git(root, 'rev-parse', 'HEAD');
  const record = { version: 2, repository: 'example/project', baseSha: base, headSha: head, policyRevision: base,
    policySha256: hash(policyBytes), authoritySet: { manifestSha256: provenance.manifestSha256, setDigest: provenance.setDigest },
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: hash(authority), newSha256: hash(after) },
    missingDecision: { id: 'reporting-owner', summary: 'Choose the reporting owner.' }, purpose: 'Add the missing reporting responsibility' };
  options.record?.(record);
  const message = join(root, 'tag-message.json');
  writeFileSync(message, `${JSON.stringify(canonical(record))}\n`);
  git(root, 'tag', '-a', `architecture-owner-addition/${head}`, '-F', message, head);
  git(root, 'checkout', '-q', '--detach', base);
  const env = { ...process.env, GITHUB_WORKSPACE: root, GITHUB_REPOSITORY: 'example/project', BASE_SHA: base, HEAD_SHA: head,
    BASE_BRANCH: 'main', POLICY_PATH: '.gate/policy.json', OWNER_AUTHORITY_PATH: 'docs/architecture.md',
    OWNER_PROMPT_PATH: '.gate/eligibility.md', OWNER_SCHEMA_PATH: '.gate/eligibility.json', ORDINARY_SCHEMA_PATH: '.gate/ordinary.json',
    ORDINARY_DECISION: JSON.stringify(ordinary), ORDINARY_AUTHORITY_PROVENANCE_BASE64: encode(provenance),
    RUNNER_TEMP: runnerTemp, OUTPUT_DIR: join(runnerTemp, 'architecture-gate-owner-addition'), GITHUB_OUTPUT: join(runnerTemp, 'outputs') };
  writeFileSync(env.GITHUB_OUTPUT, '', { mode: 0o600 });
  const prepare = async overrides => {
    const cwd = process.cwd();
    const previousOutput = process.env.GITHUB_OUTPUT;
    const previousRunnerTemp = process.env.RUNNER_TEMP;
    process.chdir(runnerTemp);
    process.env.RUNNER_TEMP = runnerTemp;
    process.env.GITHUB_OUTPUT = env.GITHUB_OUTPUT;
    try { return await prepareMultiAuthorityAddition({ ...env, ...overrides }, selected, policyBytes, { fetchExternal }); }
    finally {
      process.chdir(cwd);
      if (previousOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = previousOutput;
      if (previousRunnerTemp === undefined) delete process.env.RUNNER_TEMP; else process.env.RUNNER_TEMP = previousRunnerTemp;
    }
  };
  return { root, runnerTemp, base, head, env, policyBytes, selected, provenance, ordinary, record, fetchExternal, prepare };
}
function eligible(f) { return { ...Object.fromEntries(Object.entries(schema.properties).filter(([, value]) => value.type === 'boolean').map(([key]) => [key, true])),
  version: 2, authorityIds: f.provenance.members.map(member => member.id), authoritySetDigest: f.provenance.setDigest, summary: 'Only the missing reporting decision is added.' }; }

test('v4 selects new limits and record version without expanding existing policy or local profiles', () => {
  const p = policy();
  const selected = resolveCiPolicy(p, 'main');
  assert.equal(selected.ownerAdditionVersion, 2); assert.equal(selected.authorityProfile, MULTI_AUTHORITY_PROFILE);
  assert.throws(() => validateAuthorityLimits(limits), /ceiling/);
  assert.throws(() => resolveCiPolicy({ ...p, version: 2 }, 'main'), /Unknown.*field/);
  for (const mutate of [value => value.branches.main.ownerAddition.version = 1,
    value => delete value.branches.main.ownerAddition.authorityId,
    value => delete value.branches.main.ownerAddition,
    value => value.branches.main.authorityLimits.maxFileBytes = 262145]) {
    const invalid = policy(); mutate(invalid); assert.throws(() => resolveCiPolicy(invalid, 'main'));
  }
});

for (const policyVersion of [4, 6]) test(`v${policyVersion} real Git CLI path includes the complete base set and reports bound v2 procedure`, async t => {
  const f = await fixture(t, { other: `# Migration\n${'x'.repeat(153_920)}\n` });
  execFileSync(process.execPath, [join(sourceRoot, 'dist/owner-addition-ci.mjs'), 'prepare'], { cwd: f.runnerTemp, env: f.env });
  const prompt = readFileSync(join(f.env.OUTPUT_DIR, 'eligibility-prompt.md'), 'utf8');
  assert.ok(prompt.includes('x'.repeat(153_920)));
  assert.match(prompt, /every unchanged authority/);
  assert.match(prompt, /Candidate affected authority/);
  const procedure = parseOwnerAdditionProcedure(readFileSync(f.env.GITHUB_OUTPUT, 'utf8').match(/procedure_base64=(.+)/)[1], true);
  assert.equal(procedure.version, 2); assert.equal(procedure.policySha256, hash(f.policyBytes));
  assert.deepEqual(procedure.authoritySet, f.provenance);
  const cli = join(sourceRoot, 'dist/owner-addition-ci.mjs');
  const validateEnv = { ...f.env, DECISION: JSON.stringify(eligible(f)) };
  execFileSync(process.execPath, [cli, 'validate'], { cwd: f.runnerTemp, env: validateEnv });
  const sentinel = join(f.root, 'validate-sentinel');
  for (const [artifactName, kind] of [['eligibility.schema.json', 'symlink'], ['procedure.json', 'hardlink']]) {
    const artifactPath = join(f.env.OUTPUT_DIR, artifactName);
    const original = readFileSync(artifactPath);
    writeFileSync(sentinel, 'validation sentinel');
    unlinkSync(artifactPath);
    if (kind === 'symlink') symlinkSync(sentinel, artifactPath);
    else linkSync(sentinel, artifactPath);
    const result = spawnSync(process.execPath, [cli, 'validate'], { cwd: f.runnerTemp, env: validateEnv, encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${kind} exposed ${artifactName} must fail validate`);
    assert.match(result.stderr, /Runner temporary path:|ELOOP/);
    assert.doesNotMatch(result.stderr, /invalid JSON|unexpected token/i);
    assert.equal(readFileSync(sentinel, 'utf8'), 'validation sentinel');
    unlinkSync(artifactPath);
    writeFileSync(artifactPath, original);
  }
  const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success', rawDecision: f.env.ORDINARY_DECISION,
    ownerAdditionSelected: true, ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure });
  assert.equal(classified.conclusion, 'OWNER_ADDITION_G0');
  const report = renderReport(classified, { ownerAdditionProcedure: procedure, authorityProvenance: f.provenance });
  assert.match(report, /procedure\/report version: `2`/); assert.ok(report.includes(hash(f.policyBytes)));
  assert.ok(report.includes(`Policy/base: [\`${f.base.slice(0, 12)}\`](https://github.com/example/project/commit/${f.base})`));
  assert.ok(report.includes(`B head: [\`${f.head.slice(0, 12)}\`](https://github.com/example/project/commit/${f.head})`));
  assert.ok(report.includes(`Policy/base: \`${f.base}\` · B head: \`${f.head}\``));
  assert.ok(report.includes(`object OID \`${procedure.tagObjectOid}\``));
  for (const member of f.provenance.members) assert.ok(report.includes(member.sha256));
  assert.match(report, /not semantic PASS/);
});

test('multi-authority preparation appends only to the runner-provided output sink', async t => {
  const f = await fixture(t);
  const injectedOutput = join(f.root, 'injected-output');
  await f.prepare({ GITHUB_OUTPUT: injectedOutput });
  assert.equal(existsSync(injectedOutput), false);
  assert.match(readFileSync(f.env.GITHUB_OUTPUT, 'utf8'), /^procedure_base64=/);
  assert.ok(existsSync(join(f.env.OUTPUT_DIR, 'eligibility-prompt.md')));
  assert.ok(existsSync(join(f.env.OUTPUT_DIR, 'eligibility.schema.json')));
  assert.ok(existsSync(join(f.env.OUTPUT_DIR, 'procedure.json')));
});

test('32-member long-path procedure stays one complete output line across retries', async t => {
  const f = await fixture(t, { memberCount: 32, limits: { maxMembers: 32, maxManifestBytes: 65_536 } });
  const cli = join(sourceRoot, 'dist/owner-addition-ci.mjs');
  writeFileSync(f.env.GITHUB_OUTPUT, 'preserved=value\n');

  for (let invocation = 1; invocation <= 2; invocation++) {
    execFileSync(process.execPath, [cli, 'prepare'], { cwd: f.runnerTemp, env: f.env });
    const output = readFileSync(f.env.GITHUB_OUTPUT, 'utf8');
    const lines = output.split('\n');
    assert.equal(lines.pop(), '', 'runner output ends with a newline');
    assert.equal(lines[0], 'preserved=value');
    assert.equal(lines.length, invocation + 1, 'each invocation appends exactly one complete output line');
    const outputLine = lines[invocation];
    assert.match(outputLine, /^procedure_base64=/);
    const encoded = outputLine.slice('procedure_base64='.length);
    assert.ok(encoded.length > 16_384);
    const parsed = parseOwnerAdditionProcedure(encoded, true);
    const artifact = JSON.parse(readFileSync(join(f.env.OUTPUT_DIR, 'procedure.json'), 'utf8'));
    assert.deepEqual(parsed, artifact);
    assert.equal(encoded, Buffer.from(JSON.stringify(artifact)).toString('base64'));
    assert.equal(parsed.authoritySet.members.length, 32);
    assert.ok(parsed.authoritySet.members.slice(2).every(member => member.path.length === 239));
    assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), JSON.stringify(artifact));
  }
});

test('owner-addition consumer accepts exactly 65,536 encoded base64 characters', async t => {
  const f = await fixture(t);
  const procedure = await f.prepare();
  const compact = JSON.stringify(procedure);
  const padded = compact + ' '.repeat(49_152 - Buffer.byteLength(compact));
  assert.equal(Buffer.byteLength(padded), 49_152);
  const encoded = Buffer.from(padded).toString('base64');
  assert.equal(encoded.length, 65_536);
  assert.deepEqual(parseOwnerAdditionProcedure(encoded, true), procedure);

  const nextQuantum = Buffer.from(`${padded} `).toString('base64');
  assert.equal(nextQuantum.length, 65_540);
  assert.throws(() => parseOwnerAdditionProcedure(nextQuantum, true), /Invalid G0 owner-addition procedure output/);
});

test('report truncation preserves complete G0 and Authority Set evidence ahead of long schema-valid review detail', async t => {
  const f = await fixture(t);
  const procedure = await f.prepare();
  const long = 'review detail '.repeat(160);
  const decision = {
    decision: 'OWNER_DECISION', summary: 'The reporting owner is unselected.',
    authority: [long], authorityFiles: ['docs/architecture.md'], responsibility: [long],
    capabilitySurface: [long], qualityGuarantees: [long], reviewedScope: Array.from({ length: 35 }, (_, index) => `${index}: ${long}`),
    prohibitedChanges: [long], gates: {
      sharedMechanism: { decision: 'OWNER_DECISION', summary: long, consumerOwnership: long, failClosedBehavior: long,
        compatibility: long, minimality: long },
      trustBoundary: { decision: 'OWNER_DECISION', summary: long, tokenPermissions: long, untrustedInputs: long,
        credentialHandling: long, reportingIsolation: long },
    },
  };
  const decisionSchema = JSON.parse(readFileSync(join(sourceRoot, '.codex/gatekeeper/decision.schema.json'), 'utf8'));
  assert.doesNotThrow(() => validateJsonSchema(decision, decisionSchema));
  const report = renderReport({ conclusion: 'OWNER_ADDITION_G0', summary: 'Eligible authority-only addition.', decision }, {
    repository: 'example/project', authorityProvenance: f.provenance, ownerAdditionProcedure: procedure,
    reviewedSha: f.head, runUrl: 'https://github.com/example/project/actions/runs/123',
  });
  assert.ok(report.length <= 60_000);
  assert.match(report, /Report truncated/);
  assert.ok(report.includes(procedure.policySha256));
  assert.ok(report.includes(procedure.tagObjectOid));
  assert.ok(report.includes(procedure.authoritySet.setDigest));
  assert.ok(report.includes(f.provenance.manifestSha256));
  for (const member of f.provenance.members) {
    assert.ok(report.includes(member.sha256));
    assert.ok(report.includes(member.resolvedCommit));
  }
  assert.ok(report.includes(procedure.policyRevision));
  assert.ok(report.includes(procedure.headSha));
  assert.match(report, /<\/details>\n+_Report truncated\./);
  assert.match(report, /### Run metadata[\s\S]*actions\/runs\/123/);
  assert.ok(report.endsWith('<!-- architecture-gatekeeper:result:v1 -->\n'));
});

for (const policyVersion of [5, 6]) test(`procedural v${policyVersion} emits exact raw pre-merge evidence for the selected producer`, async t => {
  const f = await fixture(t, { policy: p => {
    p.version = policyVersion;
    if (policyVersion === 6) p.branches.main.provider = 'codex';
    p.branches.main.mode = 'procedural';
    p.branches.main.adoptionEvidence = { producer: 'github-actions',
      workflowPath: '.github/workflows/architecture-gate.yml', jobName: 'Architecture Gate / owner-addition' };
  } });
  const env = { ...f.env, PR_NUMBER: '42', POLICY_VERSION: String(policyVersion), MODE: 'procedural', GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '2' };
  execFileSync(process.execPath, [join(sourceRoot, 'dist/owner-addition-ci.mjs'), 'prepare'], { cwd: f.runnerTemp, env });
  const decision = JSON.stringify(eligible(f));
  execFileSync(process.execPath, [join(sourceRoot, 'dist/owner-addition-ci.mjs'), 'validate'],
    { cwd: f.runnerTemp, env: { ...env, DECISION: decision } });
  const evidence = JSON.parse(readFileSync(join(env.OUTPUT_DIR, 'eligibility-evidence.json'), 'utf8'));
  assert.deepEqual([evidence.version, evidence.repository, evidence.targetBranch, evidence.prNumber,
    evidence.baseSha, evidence.headSha, evidence.runId, evidence.runAttempt],
  [1, 'example/project', 'main', 42, f.base, f.head, 1234, 2]);
  assert.equal(Buffer.from(evidence.ordinaryDecisionBase64, 'base64').toString(), env.ORDINARY_DECISION);
  assert.equal(Buffer.from(evidence.eligibilityDecisionBase64, 'base64').toString(), decision);
  assert.equal(Buffer.from(evidence.authoritySetProvenanceBase64, 'base64').toString(),
    Buffer.from(env.ORDINARY_AUTHORITY_PROVENANCE_BASE64, 'base64').toString());
  for (const [name, bytes] of Object.entries({ procedure: Buffer.from(evidence.procedureBase64, 'base64'),
    ordinaryDecision: Buffer.from(evidence.ordinaryDecisionBase64, 'base64'),
    eligibilityDecision: Buffer.from(evidence.eligibilityDecisionBase64, 'base64'),
    authoritySetProvenance: Buffer.from(evidence.authoritySetProvenanceBase64, 'base64') })) {
    assert.equal(evidence.digests[name], hash(bytes));
  }

  const contextPath = join(env.OUTPUT_DIR, 'evidence-context.json');
  const contextBytes = readFileSync(contextPath);
  const sentinel = join(f.root, 'context-sentinel');
  writeFileSync(sentinel, 'procedural context sentinel');
  unlinkSync(contextPath);
  symlinkSync(sentinel, contextPath);
  const linkedContext = spawnSync(process.execPath, [join(sourceRoot, 'dist/owner-addition-ci.mjs'), 'validate'],
    { cwd: f.runnerTemp, env: { ...env, DECISION: decision }, encoding: 'utf8' });
  assert.notEqual(linkedContext.status, 0, 'v5 exposed context symlink must fail validate');
  assert.match(linkedContext.stderr, /Runner temporary path:|ELOOP/);
  assert.doesNotMatch(linkedContext.stderr, /invalid JSON|unexpected token/i);
  assert.equal(readFileSync(sentinel, 'utf8'), 'procedural context sentinel');
  unlinkSync(contextPath);
  writeFileSync(contextPath, contextBytes);
});

test('eligibility preserves BOM-prefixed candidate, authority and instruction bytes', async t => {
  const instructions = '\ufeffCheck this candidate against every base authority.';
  const other = '\ufeff# Privacy\nReports must never disclose secrets.\n';
  const f = await fixture(t, { after: '\ufeff# Architecture\nThe product owner owns reporting.\n', other, prompt: instructions });
  const procedure = await f.prepare();
  const prompt = readFileSync(join(f.env.OUTPUT_DIR, 'eligibility-prompt.md'), 'utf8');
  const header = `\nCandidate affected authority (architecture, docs/architecture.md, SHA-256 ${procedure.newAuthoritySha256}):\n`;
  const start = prompt.indexOf(header) + header.length;
  assert.ok(start >= header.length);
  const proposedSnapshot = Buffer.from(prompt.slice(start, prompt.indexOf('\n\nExact B diff', start)), 'utf8');
  const proposedBytes = execFileSync('git', ['show', `${f.head}:docs/architecture.md`], { cwd: f.root });
  assert.deepEqual(proposedSnapshot, proposedBytes);
  assert.equal(hash(proposedSnapshot), procedure.newAuthoritySha256);
  assert.ok(prompt.startsWith(instructions));
  const selected = JSON.parse(prompt.split('\n').find(line => line.startsWith('[{"id":')));
  const unchanged = selected.find(member => member.id === 'privacy');
  assert.equal(unchanged.content, other);
  assert.equal(hash(Buffer.from(unchanged.content, 'utf8')), unchanged.sha256);
});

test('ordinary review and eligibility both reject omitted, duplicate, extra IDs and another set identity', async t => {
  const f = await fixture(t);
  for (const authorityIds of [['architecture'], ['architecture', 'architecture'], ['architecture', 'privacy', 'extra']]) {
    const ordinary = { ...f.ordinary, authorityIds };
    assert.throws(() => validatePreparedAuthorityDecision(ordinary, f.provenance));
    await assert.rejects(f.prepare({ ORDINARY_DECISION: JSON.stringify(ordinary) }));
    assert.throws(() => validateMultiAuthorityEligibility(JSON.stringify({ ...eligible(f), authorityIds }), schema, f.provenance));
  }
  assert.throws(() => validatePreparedAuthorityDecision({ ...f.ordinary, authoritySetDigest: 'f'.repeat(64) }, f.provenance));
  assert.throws(() => validateMultiAuthorityEligibility(JSON.stringify({ ...eligible(f), authoritySetDigest: 'f'.repeat(64) }), schema, f.provenance));
  const otherProvenance = { ...f.provenance, manifestSha256: 'f'.repeat(64) };
  await assert.rejects(f.prepare({ ORDINARY_AUTHORITY_PROVENANCE_BASE64: encode(otherProvenance) }), /provenance/);
  assert.equal(existsSync(f.env.OUTPUT_DIR), false);
});

test('unchanged conflicting authority remains in eligibility input and a negative semantic result cannot qualify', async t => {
  const f = await fixture(t, { other: '# Existing reporting rule\nThe product owner must not own reporting.\n' });
  await f.prepare();
  assert.match(readFileSync(join(f.env.OUTPUT_DIR, 'eligibility-prompt.md'), 'utf8'), /product owner must not own reporting/);
  for (const key of ['noContradiction', 'preservesExistingRules', 'noUnsupportedCompletionClaim', 'matchesOrdinaryOwnerDecision']) {
    assert.throws(() => validateMultiAuthorityEligibility(JSON.stringify({ ...eligible(f), [key]: false }), schema, f.provenance), new RegExp(key));
  }
  await assert.rejects(f.prepare({ ORDINARY_DECISION: JSON.stringify({ ...f.ordinary, gates: { existing: { decision: 'BLOCK' } } }) }), /without a BLOCK/);
});

test('exact B binding rejects stale tags, base, policy, authority, missing-decision and old records', async t => {
  for (const [name, mutate] of [
    ['head', record => record.headSha = 'd'.repeat(40)], ['base', record => record.baseSha = 'd'.repeat(40)],
    ['policy', record => record.policySha256 = 'd'.repeat(64)], ['set', record => record.authoritySet.setDigest = 'd'.repeat(64)],
    ['manifest', record => record.authoritySet.manifestSha256 = 'd'.repeat(64)], ['member', record => record.authority.id = 'privacy'],
    ['bytes', record => record.authority.newSha256 = 'd'.repeat(64)], ['decision', record => record.missingDecision.id = 'other-owner'],
    ['version', record => record.version = 1],
  ]) await t.test(name, async child => { const f = await fixture(child, { record: mutate }); await assert.rejects(f.prepare()); });
});

test('single-file B cannot change policy, manifest, another authority or implementation', async t => {
  for (const path of ['.gate/policy.json', '.gate/authorities.json', 'docs/privacy.md', 'docs/implementation.md']) {
    await t.test(path, async child => {
      const f = await fixture(child, { extraChanges: { [path]: 'candidate replacement' } });
      await assert.rejects(f.prepare(), /exactly its one existing/); assert.equal(existsSync(f.env.OUTPUT_DIR), false);
    });
  }
  await assert.rejects(fixture(t, { policy: p => p.branches.main.ownerAddition.authorityId = 'wrong' }), /affected self member/);
  await assert.rejects(fixture(t, { manifest: value => value.authorities.push({ ...value.authorities[0], id: 'duplicate-path' }) }), /affected self member/);
  await assert.rejects(fixture(t, { manifest: value => value.authorities.push({ id: 'missing', repository: 'self', revision: 'authority-revision', path: 'docs/missing.md' }) }), /missing/);
});

test('new profile accepts the exact file ceiling and rejects over-ceiling or lower consumer limits', async t => {
  const f = await fixture(t, { other: 'x'.repeat(262_144) });
  await f.prepare();
  await assert.rejects(fixture(t, { other: 'x'.repeat(262_145) }), /file limits/);
  await assert.rejects(fixture(t, { other: 'x'.repeat(153_943), limits: { maxFileBytes: 131_072 } }), /file limits/);
  const after = await fixture(t, { after: 'x'.repeat(262_145) });
  await assert.rejects(after.prepare(), /file limits/);
});

test('base, proposed total and complete prompt budgets fail before eligibility output', async t => {
  await assert.rejects(fixture(t, { other: 'x'.repeat(2000), limits: { maxTotalBytes: 2000 } }), /total authority/);
  const total = await fixture(t, { other: 'x'.repeat(2000), after: 'y'.repeat(3000), limits: { maxTotalBytes: 4000 } });
  await assert.rejects(total.prepare(), /complete Authority Set exceeds/);
  const prompt = await fixture(t, { limits: { maxPromptBytes: 4000 } });
  await assert.rejects(prompt.prepare(), /complete prompt exceeds/);
  assert.equal(existsSync(prompt.env.OUTPUT_DIR), false);
});

test('external members are materialized at the identical revision and source failure never omits them', async t => {
  const f = await fixture(t, { external: true });
  await f.prepare();
  assert.match(readFileSync(join(f.env.OUTPUT_DIR, 'eligibility-prompt.md'), 'utf8'), /Keep acquisition separate/);
  await assert.rejects(prepareMultiAuthorityAddition({ ...f.env, OUTPUT_DIR: join(f.root, 'failed') }, f.selected, f.policyBytes,
    { fetchExternal: async () => { throw new Error('source unavailable'); } }), /could not be fetched/);
  assert.equal(existsSync(join(f.root, 'failed')), false);
});

test('schema and report reject mixed legacy/new versions and incomplete provenance', async t => {
  const f = await fixture(t);
  const procedure = await f.prepare();
  validateMultiAuthorityEligibilitySchema(schema);
  assert.throws(() => validateMultiAuthorityEligibilitySchema({ ...schema, required: schema.required.filter(key => key !== 'authorityIds') }));
  assert.throws(() => validateMultiAuthorityEligibility(JSON.stringify({ ...eligible(f), version: 1 }), schema, f.provenance));
  assert.throws(() => parseOwnerAdditionProcedure(encode({ ...procedure, version: 1 }), true));
  assert.throws(() => parseOwnerAdditionProcedure(encode({ ...procedure, legacyAcceptance: true }), true));
  assert.throws(() => parseOwnerAdditionProcedure(encode({ ...procedure, authoritySet: { ...f.provenance, members: f.provenance.members.slice(0, 1) } }), true));
});

test('v6 multi-document addition preserves exact evidence rejection and cannot be selected from the candidate', async t => {
  const useV6 = p => { p.version = 6; p.branches.main.provider = 'codex'; };
  for (const mutate of [r => r.headSha = 'd'.repeat(40), r => r.policySha256 = 'd'.repeat(64),
    r => r.authoritySet.setDigest = 'd'.repeat(64), r => r.missingDecision.id = 'other-owner']) {
    const f = await fixture(t, { policy: useV6, record: mutate });
    await assert.rejects(f.prepare());
  }
  const f = await fixture(t, { policy: useV6, extraChanges: { '.gate/policy.json': 'candidate route selection' } });
  await assert.rejects(f.prepare(), /exactly its one existing/);
  const unselected = await fixture(t, { policy: useV6 });
  delete unselected.selected.ownerAdditionVersion;
  await assert.rejects(unselected.prepare(), /explicit version-2 addition/);
});
