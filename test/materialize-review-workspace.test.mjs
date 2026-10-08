import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeReviewWorkspace } from '../dist/materialize-review-workspace.mjs';

const limits = { maxFiles: 8, maxFileBytes: 4096, maxTotalBytes: 16_000 };
const oid = 'a'.repeat(40);
function snapshot(path, text, mode = '100644') {
  return { path, text, mode, gitObjectId: oid, sha256: createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex') };
}
function packet() {
  return {
    version: 1,
    revisions: { baseSha: 'b'.repeat(40), headSha: 'c'.repeat(40), reviewedMergeSha: 'd'.repeat(40) },
    limits,
    files: [
      { path: '../outside\nGEMINI.md', before: snapshot('../outside\nGEMINI.md', '\ufeffold\n'), after: snapshot('../outside\nGEMINI.md', '') },
      { path: 'nested/../../.gemini/settings.env', before: null, after: snapshot('nested/../../.gemini/settings.env', 'candidate config') },
      { path: 'gone.txt', before: snapshot('gone.txt', 'gone'), after: null },
    ],
    references: [snapshot('docs/architecture.md', 'protected\n', '100755')],
  };
}

function parent(t) {
  const value = mkdtempSync(join(tmpdir(), 'review-workspace-test-'));
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

test('materializes exact before/after/reference bytes under ordinal names and maps original paths only in manifest', t => {
  const root = parent(t);
  const result = materializeReviewWorkspace(packet(), { parentDirectory: root, limits });
  t.after(() => result.cleanup());
  assert.equal(statSync(result.directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(result.directory, 'evidence')).mode & 0o777, 0o700);
  const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
  assert.equal(manifest.files[0].path, '../outside\nGEMINI.md');
  assert.deepEqual(manifest.files[1].before, null);
  assert.deepEqual(manifest.files[2].after, null);
  assert.equal(manifest.files[0].before.sha256, packet().files[0].before.sha256);
  assert.equal(manifest.files[0].after.mode, '100644');
  assert.equal(manifest.references[0].mode, '100755');
  assert.deepEqual(readFileSync(join(result.directory, manifest.files[0].before.filename)), Buffer.from('\ufeffold\n'));
  assert.deepEqual(readFileSync(join(result.directory, manifest.files[0].after.filename)), Buffer.alloc(0));
  assert.equal(readFileSync(join(result.directory, manifest.files[1].after.filename), 'utf8'), 'candidate config');
  assert.equal(readFileSync(join(result.directory, manifest.references[0].filename), 'utf8'), 'protected\n');
  assert.deepEqual(readdirSync(join(result.directory, 'evidence')).sort(), [
    'file-0001-after.txt', 'file-0001-before.txt', 'file-0002-after.txt',
    'file-0003-before.txt', 'reference-0001.txt',
  ]);
  assert.equal(existsSync(join(root, 'outside')), false);
  result.cleanup();
  assert.equal(existsSync(result.directory), false);
});

test('rejects malformed metadata, digest changes, binary or invalid limits before allocating workspace', t => {
  const root = parent(t);
  const changed = packet(); changed.files[0].after.sha256 = '0'.repeat(64);
  assert.throws(() => materializeReviewWorkspace(changed, { parentDirectory: root, limits }), /SHA-256/);
  assert.deepEqual(readdirSync(root), []);
  const invalid = packet(); invalid.files[0].before.text = 'bad\0bytes';
  invalid.files[0].before.sha256 = createHash('sha256').update(Buffer.from(invalid.files[0].before.text)).digest('hex');
  assert.throws(() => materializeReviewWorkspace(invalid, { parentDirectory: root, limits }), /binary/);
  assert.throws(() => materializeReviewWorkspace(packet(), { parentDirectory: root, limits: { ...limits, maxFiles: 33 } }), /runtime ceiling/);
  assert.deepEqual(readdirSync(root), []);
});

test('enforces file count, per-file and total byte bounds and unique revisions', t => {
  const root = parent(t);
  const countLimited = packet(); countLimited.limits = { ...limits, maxFiles: 2 };
  assert.throws(() => materializeReviewWorkspace(countLimited, { parentDirectory: root, limits: countLimited.limits }), /maxFiles/);
  const tooLarge = packet(); tooLarge.limits = { ...limits, maxFileBytes: 4 }; tooLarge.files[0].after = snapshot(tooLarge.files[0].path, 'x'.repeat(4097));
  assert.throws(() => materializeReviewWorkspace(tooLarge, { parentDirectory: root, limits: tooLarge.limits }), /maxFileBytes/);
  const totalLimited = packet(); totalLimited.limits = { ...limits, maxTotalBytes: 64 };
  assert.throws(() => materializeReviewWorkspace(totalLimited, { parentDirectory: root, limits: totalLimited.limits }), /maxTotalBytes/);
  const revisions = packet(); revisions.revisions.headSha = revisions.revisions.baseSha;
  assert.throws(() => materializeReviewWorkspace(revisions, { parentDirectory: root, limits }), /revision metadata/);
  assert.deepEqual(readdirSync(root), []);
});
