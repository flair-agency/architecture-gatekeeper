import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeArtifactFile, readArtifactFile, ensureArtifactDirectory } from '../dist/runner-paths/artifact-file-io.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'agk-artifact-io-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const unix = process.platform !== 'win32';

test('write accepts string, Buffer, URL, and descriptor targets outside the checkout', t => {
  const root = fixture(t);
  const stringPath = join(root, 'string');
  const bufferPath = join(root, 'buffer');
  const urlPath = join(root, 'url');
  writeArtifactFile(stringPath, 'text');
  writeArtifactFile(Buffer.from(bufferPath), Buffer.from([0, 1, 255]));
  writeArtifactFile(pathToFileURL(urlPath), 'url');
  const fdPath = join(root, 'descriptor');
  const fd = fs.openSync(fdPath, 'w+', 0o600);
  try {
    fs.writeSync(fd, 'prefix:');
    writeArtifactFile(fd, 'value');
    assert.equal(fs.fstatSync(fd).size, 12, 'descriptor writes from current position without truncating');
    assert.equal(fs.readFileSync(fdPath, 'utf8'), 'prefix:value');
    assert.doesNotThrow(() => fs.fstatSync(fd), 'descriptor remains open');
  } finally { fs.closeSync(fd); }
  assert.equal(fs.readFileSync(stringPath, 'utf8'), 'text');
  assert.deepEqual(fs.readFileSync(bufferPath), Buffer.from([0, 1, 255]));
  assert.equal(fs.readFileSync(urlPath, 'utf8'), 'url');
});

test('overwrite truncates a regular file, keeps its mode, and creates missing files with requested mode', t => {
  const root = fixture(t);
  const target = join(root, 'existing');
  fs.writeFileSync(target, 'a much longer prior payload');
  if (unix) fs.chmodSync(target, 0o640);
  writeArtifactFile(target, 'an intermediate replacement');
  writeArtifactFile(target, 'new');
  assert.equal(fs.readFileSync(target, 'utf8'), 'new');
  if (unix) assert.equal(fs.statSync(target).mode & 0o777, 0o640);
  const created = join(root, 'created');
  writeArtifactFile(created, 'private');
  if (unix) assert.equal(fs.statSync(created).mode & 0o777, 0o600);
  const custom = join(root, 'custom');
  writeArtifactFile(custom, 'custom', { mode: 0o640 });
  if (unix) assert.equal(fs.statSync(custom).mode & 0o777, 0o640 & ~process.umask());
});

test('relative paths are evaluated in the caller process working directory', t => {
  const root = fixture(t);
  const modulePath = new URL('../dist/runner-paths/artifact-file-io.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { writeArtifactFile, readArtifactFile, ensureArtifactDirectory } from ${JSON.stringify(modulePath)};
    process.chdir(process.argv[1]);
    ensureArtifactDirectory('relative/nested');
    writeArtifactFile('relative/nested/file', 'relative');
    assert.equal(readArtifactFile('relative/nested/file', 'utf8'), 'relative');
    assert.equal(fs.readFileSync('relative/nested/file', 'utf8'), 'relative');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('POSIX Buffer paths preserve non-UTF8 parent and leaf filename bytes', { skip: !unix }, t => {
  const root = fixture(t);
  const modulePath = new URL('../dist/runner-paths/artifact-file-io.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { join } from 'node:path';
    import { writeArtifactFile, readArtifactFile, ensureArtifactDirectory } from ${JSON.stringify(modulePath)};
    const root = Buffer.from(process.argv[1]);
    const parent = Buffer.concat([root, Buffer.from('/parent-'), Buffer.from([0xff])]);
    const target = Buffer.concat([parent, Buffer.from('/leaf-'), Buffer.from([0xfe])]);
    ensureArtifactDirectory(parent);
    writeArtifactFile(target, Buffer.from([0, 255, 7]));
    assert.deepEqual(readArtifactFile(target), Buffer.from([0, 255, 7]));
    assert.deepEqual(fs.readFileSync(target), Buffer.from([0, 255, 7]));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('append creates a missing file with the caller-selected mode', t => {
  const root = fixture(t);
  const target = join(root, 'append');
  writeArtifactFile(target, 'first', { append: true, mode: 0o666 });
  writeArtifactFile(target, ' second', { append: true });
  assert.equal(fs.readFileSync(target, 'utf8'), 'first second');
  if (unix) assert.equal(fs.statSync(target).mode & 0o777, 0o666 & ~process.umask());
});

test('append sink policy can select a path outside the helper', t => {
  const root = fixture(t);
  const sink = join(root, 'caller-selected-sink.log');
  // The helper receives the already-selected path; it does not constrain its location.
  writeArtifactFile(sink, 'event\n', { append: true });
  assert.equal(fs.readFileSync(sink, 'utf8'), 'event\n');
});

test('read returns text only when asked and otherwise returns a Buffer', t => {
  const root = fixture(t);
  const target = join(root, 'input');
  fs.writeFileSync(target, Buffer.from([0, 65, 255]));
  assert.equal(readArtifactFile(target, 'utf8'), '\0A�');
  assert.deepEqual(readArtifactFile(target), Buffer.from([0, 65, 255]));
  assert.equal(readArtifactFile(Buffer.from(target), 'utf8'), '\0A�');
  assert.deepEqual(readArtifactFile(pathToFileURL(target)), Buffer.from([0, 65, 255]));
});

test('descriptor reads begin at the current offset and leave the descriptor open', t => {
  const root = fixture(t);
  const target = join(root, 'input');
  fs.writeFileSync(target, 'abcdef');
  const fd = fs.openSync(target, 'r');
  try {
    fs.readSync(fd, Buffer.alloc(2), 0, 2, null);
    assert.equal(readArtifactFile(fd, 'utf8'), 'cdef');
    assert.equal(fs.readSync(fd, Buffer.alloc(1), 0, 1, null), 0, 'read consumed from current offset');
    assert.doesNotThrow(() => fs.fstatSync(fd), 'descriptor remains open');
  } finally { fs.closeSync(fd); }
});

test('an open then unlinked regular descriptor remains usable', { skip: !unix }, t => {
  const root = fixture(t);
  const path = join(root, 'unlinked');
  const fd = fs.openSync(path, 'w+', 0o600);
  try {
    fs.writeSync(fd, 'prefix:');
    fs.unlinkSync(path);
    assert.equal(fs.fstatSync(fd).nlink, 0);
    writeArtifactFile(fd, 'value');
    const bytes = Buffer.alloc(12);
    fs.readSync(fd, bytes, 0, bytes.length, 0);
    assert.equal(bytes.toString(), 'prefix:value');
    assert.equal(readArtifactFile(fd, 'utf8'), '');
    assert.equal(fs.fstatSync(fd).size, 12);
  } finally { fs.closeSync(fd); }
});

test('ensureArtifactDirectory creates nested directories with private mode', t => {
  const root = fixture(t);
  const selected = join(root, 'nested', 'directory');
  ensureArtifactDirectory(selected);
  assert.equal(fs.statSync(selected).isDirectory(), true);
  if (unix) assert.equal(fs.statSync(selected).mode & 0o777, 0o700);
  assert.doesNotThrow(() => ensureArtifactDirectory(selected));
});

test('write and read reject symlinks, hardlinks, and non-regular entries without modifying sentinels', t => {
  const root = fixture(t);
  const source = join(root, 'source');
  fs.writeFileSync(source, 'sentinel');
  const link = join(root, 'hardlink');
  fs.linkSync(source, link);
  const dangling = join(root, 'dangling');
  const symlink = join(root, 'symlink');
  const dirLink = join(root, 'dir-link');
  fs.symlinkSync(join(root, 'missing-target'), dangling);
  fs.symlinkSync(source, symlink);
  fs.mkdirSync(join(root, 'real-dir'));
  fs.symlinkSync(join(root, 'real-dir'), dirLink);
  const directory = join(root, 'directory');
  fs.mkdirSync(directory);
  for (const selected of [link, dangling, symlink, directory]) {
    assert.throws(() => writeArtifactFile(selected, 'replacement'), selected);
    assert.throws(() => readArtifactFile(selected), selected);
  }
  assert.throws(() => writeArtifactFile(join(dirLink, 'new'), 'replacement'));
  assert.throws(() => readArtifactFile(join(dirLink, 'new')));
  assert.equal(fs.readFileSync(source, 'utf8'), 'sentinel');
  assert.equal(fs.existsSync(join(root, 'real-dir', 'new')), false);
});

test('FIFO and device leaves are rejected without blocking or changing device contents', { skip: !unix }, t => {
  const root = fixture(t);
  const fifo = join(root, 'fifo');
  const made = spawnSync('mkfifo', [fifo], { timeout: 3000 });
  if (made.error || made.status !== 0) return t.skip('mkfifo unavailable');
  const modulePath = new URL('../dist/runner-paths/artifact-file-io.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { writeArtifactFile, readArtifactFile } from ${JSON.stringify(modulePath)};
    const fifo = process.argv[1];
    assert.throws(() => writeArtifactFile(fifo, 'must not block'));
    assert.throws(() => readArtifactFile(fifo));
    assert.throws(() => writeArtifactFile('/dev/null', 'must not write'));
    assert.throws(() => readArtifactFile('/dev/null'));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, fifo], { encoding: 'utf8', timeout: 4000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('mkdir refuses a parent alias and never creates through it', t => {
  const root = fixture(t);
  const real = join(root, 'real');
  const alias = join(root, 'alias');
  fs.mkdirSync(real);
  fs.symlinkSync(real, alias);
  assert.throws(() => ensureArtifactDirectory(join(alias, 'child')));
  assert.equal(fs.existsSync(join(real, 'child')), false);
});

test('lexical parent traversal cannot hide a symlink component', t => {
  const root = fixture(t);
  const real = join(root, 'real');
  fs.mkdirSync(real);
  fs.mkdirSync(join(real, 'child'));
  fs.symlinkSync(join(real, 'child'), join(root, 'alias'));
  fs.writeFileSync(join(real, 'target'), 'sentinel');
  const throughAlias = `${root}/alias/../target`;
  assert.throws(() => writeArtifactFile(throughAlias, 'replacement'));
  assert.throws(() => readArtifactFile(throughAlias));
  assert.equal(fs.readFileSync(join(real, 'target'), 'utf8'), 'sentinel');
});

test('repeated separators cannot hide a symlink parent for string or Buffer paths', t => {
  const root = fixture(t);
  const real = join(root, 'real');
  fs.mkdirSync(real);
  const target = join(real, 'file');
  fs.writeFileSync(target, 'sentinel');
  fs.symlinkSync(real, join(root, 'alias'));
  const stringPath = `${root}/alias//file`;
  const bufferPath = Buffer.from(stringPath);
  for (const selected of [stringPath, bufferPath]) {
    assert.throws(() => writeArtifactFile(selected, 'replacement'));
    assert.throws(() => readArtifactFile(selected));
    assert.equal(fs.readFileSync(target, 'utf8'), 'sentinel');
  }
});

test('ensureArtifactDirectory rejects a trailing-separator parent alias without creating through it', t => {
  const root = fixture(t);
  const real = join(root, 'real');
  fs.mkdirSync(real);
  fs.symlinkSync(real, join(root, 'alias'));
  const selected = `${root}/alias//child/`;
  assert.throws(() => ensureArtifactDirectory(selected));
  assert.equal(fs.existsSync(join(real, 'child')), false);
});

for (const scenario of ['replaced-leaf-before-open', 'hardlink-before-open', 'hardlink-after-open', 'replaced-parent-after-open', 'created-file-parent-after-open']) {
  test(`path-boundary race ${scenario} aborts before data access`, { timeout: 10000 }, () => {
    const modulePath = new URL('../dist/runner-paths/artifact-file-io.mjs', import.meta.url).href;
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      import { writeArtifactFile, readArtifactFile } from ${JSON.stringify(modulePath)};
      const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'agk-artifact-race-'));
      try {
        const parent = join(root, 'parent'); fs.mkdirSync(parent);
        const target = join(parent, 'target'); fs.writeFileSync(target, 'original-sentinel');
        const nativeOpen = fs.openSync; let changed = false;
        if (process.argv[1] === 'replaced-leaf-before-open') {
          fs.openSync = (path, flags, ...args) => {
            if (path === target && !changed) { changed = true; fs.renameSync(target, join(root, 'old')); fs.writeFileSync(target, 'replacement-sentinel'); }
            return nativeOpen(path, flags, ...args);
          };
          syncBuiltinESMExports();
          assert.throws(() => writeArtifactFile(target, 'payload'));
          assert.equal(fs.readFileSync(target, 'utf8'), 'replacement-sentinel');
          assert.equal(fs.readFileSync(join(root, 'old'), 'utf8'), 'original-sentinel');
        } else if (process.argv[1] === 'hardlink-before-open' || process.argv[1] === 'hardlink-after-open') {
          const source = join(root, 'source'); fs.writeFileSync(source, 'hardlink-sentinel');
          fs.openSync = (path, flags, ...args) => {
            if (path === target && !changed && process.argv[1] === 'hardlink-before-open') {
              changed = true; fs.unlinkSync(target); fs.linkSync(source, target);
            }
            const fd = nativeOpen(path, flags, ...args);
            if (path === target && !changed && process.argv[1] === 'hardlink-after-open') {
              changed = true; fs.linkSync(target, join(root, 'late-hardlink'));
            }
            return fd;
          };
          syncBuiltinESMExports();
          assert.throws(() => writeArtifactFile(target, 'payload'));
          assert.equal(fs.readFileSync(source, 'utf8'), 'hardlink-sentinel');
          if (process.argv[1] === 'hardlink-after-open') {
            assert.equal(fs.readFileSync(target, 'utf8'), 'original-sentinel');
            assert.equal(fs.readFileSync(join(root, 'late-hardlink'), 'utf8'), 'original-sentinel');
          }
        } else {
          const createNew = process.argv[1] === 'created-file-parent-after-open';
          const selectedTarget = createNew ? join(parent, 'new-target') : target;
          if (createNew) fs.unlinkSync(target);
          let swaps = 0;
          fs.openSync = (path, flags, ...args) => {
            const fd = nativeOpen(path, flags, ...args);
            if (path === selectedTarget && !changed) {
              changed = true;
              fs.renameSync(parent, join(root, swaps++ === 0 ? 'old-parent' : 'displaced-parent'));
              fs.mkdirSync(parent); fs.writeFileSync(selectedTarget, 'replacement-parent-sentinel');
            }
            return fd;
          };
          syncBuiltinESMExports();
          assert.throws(() => writeArtifactFile(selectedTarget, 'payload'));
          if (createNew) {
            assert.equal(fs.readFileSync(selectedTarget, 'utf8'), 'replacement-parent-sentinel');
            assert.equal(fs.readFileSync(join(root, 'old-parent', 'new-target'), 'utf8'), '', 'creation race leaves an empty file only');
          } else {
            changed = false;
            assert.throws(() => readArtifactFile(target));
            assert.equal(fs.readFileSync(target, 'utf8'), 'replacement-parent-sentinel');
            assert.equal(fs.readFileSync(join(root, 'old-parent', 'target'), 'utf8'), 'original-sentinel');
            assert.equal(fs.readFileSync(join(root, 'displaced-parent', 'target'), 'utf8'), 'replacement-parent-sentinel');
          }
        }
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, scenario], {
      encoding: 'utf8', timeout: 8000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}
