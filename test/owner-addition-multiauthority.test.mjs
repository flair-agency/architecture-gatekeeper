import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MULTI_AUTHORITY_PROFILE, validateAuthorityLimits } from '../src/authority-set.mjs';
import { prepareAuthoritySet } from '../src/prepare-authority-set.mjs';
import { resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { validatePreparedAuthorityDecision } from '../src/validate-authority-set-decision.mjs';
import { prepareMultiAuthorityAddition, validateMultiAuthorityEligibility,
  validateMultiAuthorityEligibilitySchema } from '../src/owner-addition-multiauthority.mjs';
import { classifyReview, parseOwnerAdditionProcedure, renderReport } from '../src/ci-report.mjs';

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
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
    OUTPUT_DIR: join(root, 'addition-inputs'), GITHUB_OUTPUT: join(root, 'outputs') };
  return { root, base, head, env, policyBytes, selected, provenance, ordinary, record, fetchExternal,
    prepare: overrides => prepareMultiAuthorityAddition({ ...env, ...overrides }, selected, policyBytes, { fetchExternal }) };
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

test('real Git CLI path includes the complete base set and reports bound v2 procedure', async t => {
  const f = await fixture(t, { other: `# Migration\n${'x'.repeat(153_920)}\n` });
  execFileSync(process.execPath, [join(sourceRoot, 'src/owner-addition-ci.mjs'), 'prepare'], { cwd: f.root, env: f.env });
  const prompt = readFileSync(join(f.env.OUTPUT_DIR, 'eligibility-prompt.md'), 'utf8');
  assert.ok(prompt.includes('x'.repeat(153_920)));
  assert.match(prompt, /every unchanged authority/);
  assert.match(prompt, /Candidate affected authority/);
  const procedure = parseOwnerAdditionProcedure(readFileSync(f.env.GITHUB_OUTPUT, 'utf8').match(/procedure_base64=(.+)/)[1], true);
  assert.equal(procedure.version, 2); assert.equal(procedure.policySha256, hash(f.policyBytes));
  assert.deepEqual(procedure.authoritySet, f.provenance);
  execFileSync(process.execPath, [join(sourceRoot, 'src/owner-addition-ci.mjs'), 'validate'], { cwd: f.root, env: { ...f.env, DECISION: JSON.stringify(eligible(f)) } });
  const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success', rawDecision: f.env.ORDINARY_DECISION,
    ownerAdditionSelected: true, ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure });
  assert.equal(classified.conclusion, 'OWNER_ADDITION_G0');
  const report = renderReport(classified, { ownerAdditionProcedure: procedure, authorityProvenance: f.provenance });
  assert.match(report, /procedure\/report version: `2`/); assert.ok(report.includes(hash(f.policyBytes)));
  for (const member of f.provenance.members) assert.ok(report.includes(member.sha256));
  assert.match(report, /not semantic PASS/);
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
