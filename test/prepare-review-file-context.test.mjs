import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReviewFileContext } from '../dist/prepare-review-file-context.mjs';

const limits = { maxFiles: 16, maxFileBytes: 4096, maxTotalBytes: 20_000 };
const git = (root, ...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim();

function fixture(t, setup = root => writeFileSync(join(root, 'modify.txt'), 'candidate contents\n'), stageSetup = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'review-file-context-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(root, 'modify.txt'), 'old contents\n');
  writeFileSync(join(root, 'delete.txt'), 'deleted contents\n');
  writeFileSync(join(root, 'mode.txt'), 'base mode\n');
  writeFileSync(join(root, 'reference.md'), 'base reference bytes\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-qb', 'candidate');
  setup(root);
  git(root, 'add', '-A'); stageSetup(root); git(root, 'commit', '-qm', 'candidate');
  const headSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-');
  writeFileSync(join(root, 'target.txt'), 'base target\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'target update');
  const actualBase = git(root, 'rev-parse', 'HEAD');
  git(root, 'merge', '--no-ff', '-qm', 'review merge', 'candidate');
  const reviewedSha = git(root, 'rev-parse', 'HEAD');
  return { root, baseSha: actualBase, headSha, reviewedSha };
}

function build(context, overrides = {}) {
  return prepareReviewFileContext({ ...context, referencePaths: ['reference.md'], limits, ...overrides });
}

test('returns immutable exact snapshots for additions, deletions, edits, mode changes and newline paths', t => {
  const context = fixture(t, root => {
    writeFileSync(join(root, 'modify.txt'), 'new contents\n');
    rmSync(join(root, 'delete.txt'));
    writeFileSync(join(root, 'added\nname.txt'), 'added bytes\n');
    writeFileSync(join(root, 'mode.txt'), 'mode stays text\n');
    chmodSync(join(root, 'mode.txt'), 0o755);
  });
  const packet = build(context);
  assert.equal(packet.version, 1);
  assert.deepEqual(packet.revisions, { baseSha: context.baseSha, headSha: context.headSha, reviewedMergeSha: context.reviewedSha });
  const byPath = new Map(packet.files.map(file => [file.path, file]));
  assert.equal(byPath.get('modify.txt').before.text, 'old contents\n');
  assert.equal(byPath.get('modify.txt').after.text, 'new contents\n');
  assert.equal(byPath.get('delete.txt').after, null);
  assert.equal(byPath.get('delete.txt').before.text, 'deleted contents\n');
  assert.equal(byPath.get('added\nname.txt').before, null);
  assert.equal(byPath.get('added\nname.txt').after.text, 'added bytes\n');
  assert.equal(byPath.get('mode.txt').after.mode, '100755');
  assert.equal(byPath.get('mode.txt').before.mode, '100644');
  assert.equal(packet.references[0].text, 'base reference bytes\n');
  assert.ok(Object.isFrozen(packet) && Object.isFrozen(packet.files) && Object.isFrozen(packet.files[0]));
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) <= limits.maxTotalBytes);
  assert.equal(Object.hasOwn(packet.files.find(file => file.path === 'target.txt') || {}, 'path'), false);
});

test('uses only recorded commits, excludes untracked files and reads explicit references from base', t => {
  const context = fixture(t, root => {
    writeFileSync(join(root, 'reference.md'), 'candidate reference version\n');
    writeFileSync(join(root, 'new.txt'), 'committed candidate\n');
  });
  writeFileSync(join(context.root, 'untracked.txt'), 'working tree secret\n');
  const packet = build(context);
  assert.equal(packet.references[0].text, 'base reference bytes\n');
  assert.equal(packet.files.some(file => file.path === 'untracked.txt'), false);
  assert.equal(packet.files.some(file => file.path === 'new.txt'), true);
});

test('rejects wrong parents, duplicate or missing revisions, and malformed reference selection', t => {
  const context = fixture(t);
  assert.throws(() => build({ ...context, headSha: context.baseSha }), /three distinct full commit revisions/);
  assert.throws(() => build({ ...context, reviewedSha: 'f'.repeat(40) }), /must exist in the checkout/);
  assert.throws(() => build(context, { referencePaths: ['missing.md'] }), /missing or ambiguous in base/);
  assert.throws(() => build(context, { referencePaths: ['reference.md', 'reference.md'] }), /must be unique/);
  assert.throws(() => build(context, { referencePaths: ['../outside'] }), /path is invalid/);
});

test('raw Git enumeration ignores hostile attributes and configured external diff drivers', t => {
  const context = fixture(t, root => {
    writeFileSync(join(root, 'modify.txt'), 'changed\n');
    writeFileSync(join(root, '.gitattributes'), '*.txt binary\nmodify.txt diff=hostile\n');
  });
  git(context.root, 'config', 'diff.hostile.command', 'touch should-not-run');
  git(context.root, 'config', 'diff.external', 'touch should-not-run-either');
  const packet = build(context, { referencePaths: [] });
  assert.equal(packet.files.find(file => file.path === 'modify.txt').after.text, 'changed\n');
  assert.equal(existsSync(join(context.root, 'should-not-run')), false);
  assert.equal(existsSync(join(context.root, 'should-not-run-either')), false);
});

test('rejects changed symlinks, gitlinks, binary bytes, and invalid UTF-8', t => {
  const symlink = fixture(t, root => symlinkSync('modify.txt', join(root, 'link.txt')));
  assert.throws(() => build(symlink), /not a supported regular text file/);

  const gitlink = fixture(t, () => {}, root => {
    git(root, 'update-index', '--add', '--cacheinfo', `160000,${git(root, 'rev-parse', 'HEAD')},vendor-link`);
  });
  assert.throws(() => build(gitlink), /not a supported regular text file/);

  const binary = fixture(t, root => writeFileSync(join(root, 'modify.txt'), Buffer.from([0x61, 0x00, 0x62])));
  assert.throws(() => build(binary), /contains binary data/);
  const encoding = fixture(t, root => writeFileSync(join(root, 'modify.txt'), Buffer.from([0x61, 0xff])));
  assert.throws(() => build(encoding), /not valid UTF-8/);
});

test('requires explicit valid capped limits and rejects per-file, file-count and serialized-total overflow', t => {
  const context = fixture(t, root => writeFileSync(join(root, 'modify.txt'), 'x'.repeat(32)));
  assert.throws(() => build(context, { limits: undefined }), /explicit limits are required/);
  assert.throws(() => build(context, { limits: { ...limits, maxFiles: 33 } }), /maxFiles.*runtime ceiling/);
  assert.throws(() => build(context, { limits: { ...limits, maxFileBytes: 4 } }), /exceeds maxFileBytes/);
  assert.throws(() => build(context, { limits: { ...limits, maxFiles: 1 } }), /exceed maxFiles/);
  assert.throws(() => build(context, { limits: { ...limits, maxTotalBytes: 32 } }), /serialized review context exceeds maxTotalBytes/);
  assert.throws(() => build(context, { limits: { ...limits, total: 500 } }), /unsupported field/);
});


test('preserves UTF-8 BOM and empty file bytes in the recorded snapshots', t => {
  const bom = Buffer.from('\ufeffBOM contents\n', 'utf8');
  const context = fixture(t, root => {
    writeFileSync(join(root, '\ufeffbom.txt'), bom);
    writeFileSync(join(root, 'empty.txt'), '');
  });
  const packet = build(context);
  const snapshot = packet.files.find(file => file.path === '\ufeffbom.txt').after;
  assert.deepEqual(Buffer.from(snapshot.text, 'utf8'), bom);
  assert.equal(packet.files.find(file => file.path === 'empty.txt').after.text, '');
});


test('protected base checkout produces identical candidate evidence without materializing candidate files', t => {
  const context = fixture(t, root => writeFileSync(join(root, 'candidate-only.mjs'), 'throw new Error("must not execute");\n'));
  const mergePacket = build(context);
  git(context.root, 'checkout', '--detach', context.baseSha);
  assert.equal(existsSync(join(context.root, 'candidate-only.mjs')), false);
  assert.deepEqual(build(context), mergePacket);
  git(context.root, 'checkout', '--detach', context.headSha);
  assert.throws(() => build(context), /neither the protected base nor the reviewed merge/);
});
