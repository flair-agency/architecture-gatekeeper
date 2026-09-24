import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MAX_AUTHORITY_LIMITS } from '../src/authority-set.mjs';
import { decodeLimits } from '../src/prepare-authority-set.mjs';
import { validateAuthorityReviewSchema } from '../src/preflight-authority-set-review.mjs';
import { validatePreparedAuthorityDecision } from '../src/validate-authority-set-decision.mjs';
import { parseAuthorityProvenance } from '../src/ci-report.mjs';

const effective = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 };
const encoded = Buffer.from(JSON.stringify(effective)).toString('base64');

test('protected effective limits decode strictly and stay beneath immutable runtime ceilings', () => {
  assert.deepEqual(decodeLimits(encoded), effective);
  assert.deepEqual(decodeLimits(Buffer.from(JSON.stringify(MAX_AUTHORITY_LIMITS)).toString('base64')), MAX_AUTHORITY_LIMITS);
  for (const value of ['', 'abc$', Buffer.from('{"maxMembers":16,"maxMembers":32}').toString('base64'),
    Buffer.from(JSON.stringify({ ...effective, maxMembers: 33 })).toString('base64')]) {
    assert.throws(() => decodeLimits(value));
  }
});

test('distributed route rejects a protected schema without required Authority IDs', () => {
  const valid = { type: 'object', additionalProperties: false, required: ['decision', 'authorityIds'], properties: {
    decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
    authorityIds: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
  } };
  assert.equal(validateAuthorityReviewSchema(valid), valid);
  for (const schema of [
    { ...valid, required: ['decision'] },
    { ...valid, properties: { ...valid.properties, authorityIds: { type: 'string' } } },
    { ...valid, properties: { ...valid.properties, authorityIds: { type: 'array', minItems: 1, items: { type: 'number' } } } },
  ]) assert.throws(() => validateAuthorityReviewSchema(schema));
});

test('CI preflight bounds the complete prompt before model execution', t => {
  const root = mkdtempSync(join(tmpdir(), 'authority-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const schema = join(root, 'schema.json');
  const prompt = join(root, 'prompt.md');
  const script = new URL('../src/preflight-authority-set-review.mjs', import.meta.url).pathname;
  writeFileSync(schema, JSON.stringify({ type: 'object', required: ['authorityIds'], properties: { authorityIds: { type: 'array', items: { type: 'string' }, minItems: 1 } } }));
  const env = { ...process.env, AUTHORITY_LIMITS_BASE64: Buffer.from(JSON.stringify({ ...effective, maxPromptBytes: 8 })).toString('base64') };
  writeFileSync(prompt, '12345678');
  assert.doesNotThrow(() => execFileSync(process.execPath, [script, schema, prompt], { env }));
  writeFileSync(prompt, '123456789');
  assert.throws(() => execFileSync(process.execPath, [script, schema, prompt], { env, stdio: 'ignore' }));
});

test('protected-base self authority reaches review with complete provenance and exact IDs', t => {
  const root = mkdtempSync(join(tmpdir(), 'authority-ci-integration-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'architecture.md'), '# protected authority\n');
  const manifest = join(root, 'authorities.json');
  writeFileSync(manifest, JSON.stringify({ version: 1, authorities: [
    { id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' },
  ] }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  git('add', '.'); git('commit', '-m', 'protected base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'docs', 'architecture.md'), '# untrusted PR replacement\n');
  const output = join(root, 'prepared');
  const script = new URL('../src/prepare-authority-set.mjs', import.meta.url).pathname;
  execFileSync(process.execPath, [script, '--manifest', manifest, '--self-repository', 'flair-agency/test',
    '--self-root', root, '--authority-sha', base, '--limits-base64', encoded, '--output-dir', output]);
  const prompt = readFileSync(join(output, 'authority-prompt.md'), 'utf8');
  const provenance = JSON.parse(readFileSync(join(output, 'authority-provenance.json'), 'utf8'));
  assert.match(prompt, /protected authority/);
  assert.doesNotMatch(prompt, /untrusted PR replacement/);
  assert.equal(provenance.members[0].resolvedCommit, base);
  assert.equal(validatePreparedAuthorityDecision({ decision: 'PASS', authorityIds: ['architecture'] }, provenance).decision, 'PASS');
  assert.throws(() => validatePreparedAuthorityDecision({ decision: 'PASS', authorityIds: [] }, provenance));
});

test('reporting accepts the supported 32-member ceiling and rejects larger provenance', () => {
  const member = index => ({ id: `source-${index}`, repository: 'flair-agency/test', resolvedCommit: 'a'.repeat(40), path: 'docs/architecture.md', sha256: 'b'.repeat(64) });
  const encodedProvenance = count => Buffer.from(JSON.stringify({ version: 1, manifestSha256: 'c'.repeat(64), setDigest: 'd'.repeat(64), members: Array.from({ length: count }, (_, index) => member(index)) })).toString('base64');
  assert.equal(parseAuthorityProvenance(encodedProvenance(32)).members.length, 32);
  assert.throws(() => parseAuthorityProvenance(encodedProvenance(33)));
  assert.throws(() => parseAuthorityProvenance('', true), /Missing/);
});
