import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { beginMeasurement, loadMeasurementDirectory } from '../dist/measurement.mjs';

function directory(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'agk-entry-limit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('export counts nonrecord entries and retains the exact full-directory boundary', t => {
  const root = directory(t);
  for (let i = 0; i < 4096; i++) writeFileSync(join(root, `not-a-record-${i}`), '');
  assert.deepEqual(loadMeasurementDirectory(root), { version: 1, records: [], gaps: 0 });
  assert.equal(beginMeasurement({ route: 'manual', directory: root }).id, null);
  writeFileSync(join(root, 'overflow-not-a-record'), '');
  assert.throws(() => loadMeasurementDirectory(root), /directory entry limit exceeded/);
});

for (const scenario of ['export', 'capture', 'read-failure']) {
  test(`bounded directory iteration closes its handle after ${scenario}`, t => {
    const root = directory(t);
    // Isolated filesystem interceptors exercise an inexhaustible directory
    // and a failed read through the production entrypoints, without allocating
    // an unbounded fixture or changing another test's built-in bindings.
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { beginMeasurement, loadMeasurementDirectory } from ${JSON.stringify(new URL('../dist/measurement.mjs', import.meta.url).href)};
      let reads = 0; let closes = 0;
      fs.readdirSync = () => { throw new Error('Unbounded directory read must not be used.'); };
      fs.opendirSync = (_path, options) => {
        assert.equal(options.bufferSize, 32);
        return { readSync() {
          reads++;
          if (process.argv[2] === 'read-failure' && reads === 3) throw new Error('Directory read failed.');
          if (reads > 4097) throw new Error('Reader did not stop at the entry ceiling.');
          return { name: 'not-a-record-' + reads };
        }, closeSync() { closes++; } };
      };
      syncBuiltinESMExports();
      if (process.argv[2] === 'capture') {
        assert.equal(beginMeasurement({ route: 'manual', directory: process.argv[1] }).id, null);
        assert.equal(reads, 4094); // first overflow when three phase entries must remain
      } else {
        assert.throws(() => loadMeasurementDirectory(process.argv[1]), process.argv[2] === 'read-failure' ? /Directory read failed/ : /directory entry limit exceeded/);
        assert.equal(reads, process.argv[2] === 'read-failure' ? 3 : 4097);
      }
      assert.equal(closes, 1);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, scenario], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}
