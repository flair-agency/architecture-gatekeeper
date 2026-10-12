import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const scenario of ['no-nofollow', 'replaced-leaf']) {
  test(`diagnostic reader refuses unsafe leaf with ${scenario}`, () => {
    // Run isolated fs interceptors to exercise unavailable flags and replacement
    // between lstat and open without modifying other tests' built-in bindings.
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      import { readDiagnosticText } from ${JSON.stringify(new URL('../dist/diagnostic-path.mjs', import.meta.url).href)};
      const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'agk-leaf-'));
      try {
        const source = join(root, 'source'); const target = join(root, 'target');
        fs.writeFileSync(source, '{}');
        const nativeOpen = fs.openSync; let opens = 0;
        if (process.argv[1] === 'no-nofollow') {
          fs.symlinkSync(source, target);
          fs.openSync = (path, flags, ...args) => {
            opens++; return nativeOpen(path, flags & ~(fs.constants.O_NOFOLLOW ?? 0), ...args);
          };
          syncBuiltinESMExports();
          assert.throws(() => readDiagnosticText(target, 1024), /Invalid diagnostic file/);
          assert.equal(opens, 0);
        } else {
          fs.writeFileSync(target, '{}');
          fs.openSync = (path, flags, ...args) => {
            if (path === target) { fs.renameSync(target, join(root, 'original')); fs.writeFileSync(target, '{"replacement":true}'); }
            return nativeOpen(path, flags, ...args);
          };
          syncBuiltinESMExports();
          assert.throws(() => readDiagnosticText(target, 1024), /Invalid diagnostic file/);
        }
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, scenario], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}


for (const selected of ['home', 'temporary', 'working', ...(process.platform === 'win32' ? [] : ['unixTemporary', 'unixVariableTemporary'])]) {
  test(`a valid ${selected} root survives unavailable unrelated host roots`, () => {
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs'; import os from 'node:os';
      import { syncBuiltinESMExports } from 'node:module';
      import { join } from 'node:path';
      import { readDiagnosticText } from ${JSON.stringify(new URL('../dist/diagnostic-path.mjs', import.meta.url).href)};
      const selected = process.argv[1];
      const parent = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'agk-root-isolation-'));
      const target = join(parent, 'input.json'); fs.writeFileSync(target, '{}');
      const realpath = fs.realpathSync; const cwd = process.cwd; const calls = [];
      try {
        os.homedir = () => { calls.push('home'); if (selected === 'home') return parent; throw new Error('HOME unavailable'); };
        os.tmpdir = () => { calls.push('temporary'); if (selected === 'temporary') return parent; throw new Error('TMPDIR unavailable'); };
        process.cwd = () => { calls.push('working'); if (selected === 'working') return parent; throw new Error('cwd unavailable'); };
        fs.realpathSync = path => {
          if (path === '/tmp') { calls.push('unixTemporary'); if (selected === 'unixTemporary') return parent; throw new Error('/tmp unavailable'); }
          if (path === '/var/tmp') { calls.push('unixVariableTemporary'); if (selected === 'unixVariableTemporary') return parent; throw new Error('/var/tmp unavailable'); }
          return realpath(path);
        };
        syncBuiltinESMExports();
        assert.equal(readDiagnosticText(target, 1024), '{}');
        const order = ['home', 'temporary', 'working', 'unixTemporary', 'unixVariableTemporary'];
        assert.deepEqual(calls, order.slice(0, order.indexOf(selected) + 1), 'roots after the selected valid root must not be resolved');
        const outside = join(parent + '-outside', 'input.json');
        assert.throws(() => readDiagnosticText(outside, 1024), /outside host/);
      } finally {
        process.cwd = cwd; fs.realpathSync = realpath; syncBuiltinESMExports(); fs.rmSync(parent, { recursive: true, force: true });
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, selected], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}
