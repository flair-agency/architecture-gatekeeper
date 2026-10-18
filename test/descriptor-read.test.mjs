import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('descriptor byte reader fills caller capacity from current position and reports partial reads', () => {
  run(`
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { readDescriptorBytes } from ${JSON.stringify(new URL('../dist/io/read-descriptor.mjs', import.meta.url).href)};
    const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'agk-descriptor-read-'));
    const path = join(root, 'input'); fs.writeFileSync(path, 'abcdef');
    const fd = fs.openSync(path, fs.constants.O_RDONLY); const nativeRead = fs.readSync; const calls = [];
    try {
      const prefix = Buffer.alloc(1); assert.equal(nativeRead(fd, prefix, 0, 1, null), 1);
      fs.readSync = (descriptor, buffer, offset, length, position) => {
        calls.push({ offset, length, position });
        return nativeRead(descriptor, buffer, offset, Math.min(length, 2), position);
      };
      syncBuiltinESMExports();
      const observed = [];
      const actual = readDescriptorBytes(fd, Buffer.alloc(4), count => observed.push(count));
      assert.equal(actual.toString(), 'bcde');
      assert.deepEqual(observed, [2, 2]);
      assert.deepEqual(calls.map(call => call.offset), [0, 2]);
      assert.deepEqual(calls.map(call => call.length), [4, 2]);
      assert.ok(calls.every(call => call.position === null));
      assert.equal(fs.fstatSync(fd).isFile(), true, 'the reader leaves descriptor ownership to its caller');
      const beforeEmpty = calls.length; const beforeObserved = observed.length;
      assert.equal(readDescriptorBytes(fd, Buffer.alloc(0), count => observed.push(count)).length, 0);
      assert.equal(calls.length, beforeEmpty, 'zero capacity performs no read');
      assert.equal(observed.length, beforeObserved, 'zero capacity has no observer callback');
      fs.closeSync(fd);
      const emptyPath = join(root, 'empty'); fs.writeFileSync(emptyPath, '');
      const emptyFd = fs.openSync(emptyPath, fs.constants.O_RDONLY);
      try {
        const emptyObserved = [];
        assert.equal(readDescriptorBytes(emptyFd, Buffer.alloc(3), count => emptyObserved.push(count)).length, 0);
        assert.deepEqual(emptyObserved, [], 'EOF does not invoke the positive-read observer');
      }
      finally { fs.closeSync(emptyFd); }
    } finally {
      fs.readSync = nativeRead; syncBuiltinESMExports();
      try { fs.closeSync(fd); } catch {}
      fs.rmSync(root, { recursive: true, force: true });
    }
  `);
});

test('descriptor byte reader propagates native read and observer exceptions without taking close ownership', () => {
  run(`
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { readDescriptorBytes } from ${JSON.stringify(new URL('../dist/io/read-descriptor.mjs', import.meta.url).href)};
    const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'agk-descriptor-errors-'));
    const path = join(root, 'input'); fs.writeFileSync(path, 'abcdef');
    const fd = fs.openSync(path, fs.constants.O_RDONLY); const nativeRead = fs.readSync;
    try {
      const observerFailure = new Error('observer sentinel'); let reads = 0; let callbacks = 0;
      fs.readSync = (...args) => { reads++; return nativeRead(args[0], args[1], args[2], Math.min(args[3], 2), args[4]); };
      syncBuiltinESMExports();
      assert.throws(() => readDescriptorBytes(fd, Buffer.alloc(6), count => {
        callbacks++; assert.equal(count, 2); throw observerFailure;
      }), error => error === observerFailure);
      assert.equal(reads, 1); assert.equal(callbacks, 1);
      assert.equal(fs.fstatSync(fd).isFile(), true, 'observer failure does not close the caller descriptor');

      const ioFailure = new Error('read sentinel');
      fs.readSync = () => { throw ioFailure; }; syncBuiltinESMExports();
      assert.throws(() => readDescriptorBytes(fd, Buffer.alloc(1)), error => error === ioFailure);
      assert.equal(fs.fstatSync(fd).isFile(), true, 'read failure does not close the caller descriptor');
      fs.closeSync(fd);
    } finally {
      fs.readSync = nativeRead; syncBuiltinESMExports();
      try { fs.closeSync(fd); } catch {}
      fs.rmSync(root, { recursive: true, force: true });
    }
  `);
});

test('diagnostic reader preserves per-read observer timing and closes after observer failure', () => {
  run(`
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { readDiagnosticText } from ${JSON.stringify(new URL('../dist/diagnostic-path.mjs', import.meta.url).href)};
    const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'agk-diagnostic-observer-'));
    const target = join(root, 'input.json'); fs.writeFileSync(target, '{"x":1}');
    const nativeRead = fs.readSync; const nativeClose = fs.closeSync; const reads = []; const closed = [];
    fs.readSync = (descriptor, buffer, offset, length, position) => {
      reads.push({ descriptor, offset, position });
      return nativeRead(descriptor, buffer, offset, Math.min(length, 2), position);
    };
    fs.closeSync = descriptor => { closed.push(descriptor); return nativeClose(descriptor); };
    syncBuiltinESMExports();
    try {
      const counts = [];
      assert.equal(readDiagnosticText(target, 32, count => counts.push(count)), '{"x":1}');
      assert.deepEqual(counts, [2, 2, 2, 1]);
      assert.deepEqual(reads.map(read => read.offset), [0, 2, 4, 6, 7]);
      assert.equal(reads.length, counts.length + 1, 'the final EOF read has no observer callback');
      assert.ok(reads.every(read => read.position === null));
      assert.equal(closed.at(-1), reads[0].descriptor);

      const sentinel = new Error('budget observer sentinel'); let observed = 0; const before = reads.length;
      assert.throws(() => readDiagnosticText(target, 32, () => { observed++; throw sentinel; }), error => error === sentinel);
      assert.equal(observed, 1); assert.equal(reads.length, before + 1, 'observer aborts before a subsequent read');
      const failedDescriptor = reads.at(-1).descriptor;
      assert.equal(closed.at(-1), failedDescriptor, 'the diagnostic caller closes after callback failure');
      assert.throws(() => fs.fstatSync(failedDescriptor), { code: 'EBADF' });
    } finally {
      fs.readSync = nativeRead; fs.closeSync = nativeClose; syncBuiltinESMExports();
      fs.rmSync(root, { recursive: true, force: true });
    }
  `);
});
