import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareAuthoritySet } from '../src/prepare-authority-set.mjs';

const limits = { maxManifestBytes: 4096, maxMembers: 3, maxFileBytes: 1024, maxTotalBytes: 2048, maxPromptBytes: 8192 };
const authority = { id: 'self-contract', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' };
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'prepare-authority-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const selfRoot = join(root, 'repo'); mkdirSync(join(selfRoot, 'docs'), { recursive: true });
  git(selfRoot, 'init'); git(selfRoot, 'config', 'user.name', 'Fixture'); git(selfRoot, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(selfRoot, authority.path), '# committed authority\n'); git(selfRoot, 'add', '.'); git(selfRoot, 'commit', '-m', 'authority');
  const manifestPath = join(root, 'manifest.json'); writeFileSync(manifestPath, JSON.stringify({ version: 1, authorities: [authority] }));
  const limitsPath = join(root, 'limits.json'); writeFileSync(limitsPath, JSON.stringify(limits));
  return { root, selfRoot, manifestPath, limitsPath, authorityRevision: git(selfRoot, 'rev-parse', 'HEAD') };
}

test('writes private prompt and content-free provenance for the committed snapshot', async t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  writeFileSync(join(f.selfRoot, authority.path), '# changed working tree\n');
  const result = await prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir });
  assert.match(readFileSync(join(outputDir, 'authority-prompt.md'), 'utf8'), /# committed authority/);
  assert.doesNotMatch(readFileSync(join(outputDir, 'authority-prompt.md'), 'utf8'), /changed working tree/);
  const provenanceText = readFileSync(join(outputDir, 'authority-provenance.json'), 'utf8');
  const provenance = JSON.parse(provenanceText);
  assert.equal(provenance.members[0].id, authority.id);
  assert.equal(provenance.members[0].resolvedCommit, f.authorityRevision);
  assert.equal(provenance.members[0].byteLength, Buffer.byteLength('# committed authority\n'));
  assert.equal(provenanceText.includes('# committed authority'), false);
  assert.deepEqual(result.provenance, provenance);
  assert.equal(statSync(outputDir).mode & 0o777, 0o700);
  for (const name of ['authority-prompt.md', 'authority-provenance.json']) assert.equal(statSync(join(outputDir, name)).mode & 0o777, 0o600);
});

test('materialization failure leaves no output and existing destinations stay untouched', async t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  writeFileSync(f.manifestPath, JSON.stringify({ version: 1, authorities: [{ ...authority, path: 'docs/missing.md' }] }));
  await assert.rejects(prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir }));
  assert.throws(() => statSync(outputDir), { code: 'ENOENT' });
  mkdirSync(outputDir); writeFileSync(join(outputDir, 'keep'), 'untouched');
  await assert.rejects(prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir }));
  assert.equal(readFileSync(join(outputDir, 'keep'), 'utf8'), 'untouched');
});

test('external source credentials are not serialized to either output', async t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle'); const secret = 'sensitive-fixture-token';
  const external = { id: 'external-contract', repository: 'flair-agency/parent', revision: 'a'.repeat(40), path: 'docs/parent.md' };
  writeFileSync(f.manifestPath, JSON.stringify({ version: 1, authorities: [external] }));
  const fetchExternal = async input => ({ repository: input.repository, resolvedCommit: input.revision, path: input.path, type: 'file', content: Buffer.from('# external\n') });
  await prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir, token: secret, fetchExternal });
  for (const name of ['authority-prompt.md', 'authority-provenance.json']) assert.equal(readFileSync(join(outputDir, name), 'utf8').includes(secret), false);
});

test('preserves complete two-member order and provenance digest', async t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  const external = { id: 'external-contract', repository: 'flair-agency/parent', revision: 'a'.repeat(40), path: 'docs/parent.md' };
  const members = [authority, external];
  writeFileSync(f.manifestPath, JSON.stringify({ version: 1, authorities: members }));
  const fetchExternal = async input => ({ repository: input.repository, resolvedCommit: input.revision, path: input.path, type: 'file', content: Buffer.from('# external\n') });
  const { provenance } = await prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir, fetchExternal });
  assert.deepEqual(provenance.members.map(member => member.id), ['self-contract', 'external-contract']);
  const records = provenance.members;
  const expectedDigest = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(JSON.stringify(records)).digest('hex'));
  assert.equal(provenance.setDigest, expectedDigest);
});

test('external CLI without its explicit token fails without creating output', t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  writeFileSync(f.manifestPath, JSON.stringify({ version: 1, authorities: [{ id: 'external-contract', repository: 'flair-agency/parent', revision: 'a'.repeat(40), path: 'docs/parent.md' }] }));
  const result = spawnSync(process.execPath, [new URL('../src/prepare-authority-set.mjs', import.meta.url).pathname,
    '--manifest', f.manifestPath, '--self-repository', 'flair-agency/example', '--self-root', f.selfRoot,
    '--authority-sha', f.authorityRevision, '--limits', f.limitsPath, '--output-dir', outputDir],
  { encoding: 'utf8', env: { ...process.env, GATEKEEPER_SOURCE_TOKEN: '' } });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /sensitive|token value/i);
  assert.throws(() => statSync(outputDir), { code: 'ENOENT' });
});

test('direct CLI invocation writes the selected self-authority bundle', t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  const result = spawnSync(process.execPath, [new URL('../src/prepare-authority-set.mjs', import.meta.url).pathname,
    '--manifest', f.manifestPath, '--self-repository', 'flair-agency/example', '--self-root', f.selfRoot,
    '--authority-sha', f.authorityRevision, '--limits', f.limitsPath, '--output-dir', outputDir],
  { encoding: 'utf8', env: { ...process.env, GATEKEEPER_SOURCE_TOKEN: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(outputDir, 'authority-prompt.md'), 'utf8'), /# committed authority/);
  const provenance = JSON.parse(readFileSync(join(outputDir, 'authority-provenance.json'), 'utf8'));
  assert.equal(provenance.members[0].id, authority.id);
  assert.equal(provenance.members[0].resolvedCommit, f.authorityRevision);
});

test('invalid and empty manifests fail before output creation', async t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  for (const bytes of [Buffer.alloc(0), Buffer.from('{broken')]) {
    writeFileSync(f.manifestPath, bytes);
    await assert.rejects(prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir }));
    assert.throws(() => statSync(outputDir), { code: 'ENOENT' });
  }
});

test('rejects oversized limits and manifest inputs before parsing or output creation', async t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  writeFileSync(f.limitsPath, JSON.stringify({ ...limits, maxManifestBytes: 8 }));
  await assert.rejects(prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir }), /Manifest exceeds its input byte limit/);
  assert.throws(() => statSync(outputDir), { code: 'ENOENT' });
  writeFileSync(f.limitsPath, ' '.repeat(4097));
  await assert.rejects(prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir }), /Limits JSON exceeds its input byte limit/);
  assert.throws(() => statSync(outputDir), { code: 'ENOENT' });
});

test('rejects limits with duplicate keys and non-regular input sources', async t => {
  const f = fixture(t); const outputDir = join(f.root, 'bundle');
  writeFileSync(f.limitsPath, '{"maxManifestBytes":4096,"maxManifestBytes":1,"maxMembers":3,"maxFileBytes":1024,"maxTotalBytes":2048,"maxPromptBytes":8192}');
  await assert.rejects(prepareAuthoritySet({ ...f, selfRepository: 'flair-agency/example', outputDir }), /Limits JSON contains duplicate keys/);
  assert.throws(() => statSync(outputDir), { code: 'ENOENT' });
  writeFileSync(f.limitsPath, JSON.stringify(limits));
  const manifestDirectory = join(f.root, 'manifest-directory'); mkdirSync(manifestDirectory);
  await assert.rejects(prepareAuthoritySet({ ...f, manifestPath: manifestDirectory, selfRepository: 'flair-agency/example', outputDir }), /regular file/);
  assert.throws(() => statSync(outputDir), { code: 'ENOENT' });
});
