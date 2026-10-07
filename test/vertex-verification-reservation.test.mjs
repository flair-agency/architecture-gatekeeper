import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, closeSync, linkSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createVertexVerificationReservation } from '../src/vertex-verification-reservation.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'vertex-verification-ledger-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'attempts');
}

test('five reservations persist across sessions and a new supervisor process', t => {
  const path = fixture(t);
  let fd = openSync(path, 'wx+', 0o600);
  try {
    const reserve = createVertexVerificationReservation(fd);
    assert.equal(reserve(), true);
    assert.equal(reserve(), true);
  } finally { closeSync(fd); }
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { openSync, closeSync } from 'node:fs';
    import { createVertexVerificationReservation } from ${JSON.stringify(new URL('../src/vertex-verification-reservation.mjs', import.meta.url).href)};
    const fd = openSync(process.argv[1], 'r+');
    const reserve = createVertexVerificationReservation(fd);
    console.log(JSON.stringify([reserve(), reserve(), reserve(), reserve()]));
    closeSync(fd);
  `, path], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), [true, true, true, false]);
  assert.equal(readFileSync(path, 'utf8'), 'AGK334-V1\n1\n2\n3\n4\n5\n');
  fd = openSync(path, 'r+');
  try { assert.equal(createVertexVerificationReservation(fd)(), false); }
  finally { closeSync(fd); }
});

test('corruption after startup and read-only reservation fail closed without resetting', t => {
  const path = fixture(t);
  writeFileSync(path, 'AGK334-V1\n1\n', { mode: 0o600 });
  const fd = openSync(path, 'r');
  try {
    const reserve = createVertexVerificationReservation(fd);
    assert.equal(reserve(), false);
    assert.equal(readFileSync(path, 'utf8'), 'AGK334-V1\n1\n');
    writeFileSync(path, 'AGK334-V1\n1\n3\n');
    assert.equal(reserve(), false);
    assert.throws(() => createVertexVerificationReservation(fd), /invalid/);
  } finally { closeSync(fd); }
});

test('missing, malformed and nonprivate descriptors are rejected', t => {
  const path = fixture(t);
  for (const value of [undefined, 0, 1, 2, -1, 3.5]) {
    assert.throws(() => createVertexVerificationReservation(value), /file descriptor/);
  }
  writeFileSync(path, 'AGK334-V1\n5\n', { mode: 0o600 });
  const fd = openSync(path, 'r+');
  try { assert.throws(() => createVertexVerificationReservation(fd), /invalid/); }
  finally { closeSync(fd); }
});


test('world-accessible, hardlinked and unlinked ledgers cannot authorize sends', t => {
  const path = fixture(t);
  let fd = openSync(path, 'wx+', 0o600);
  try {
    const reserve = createVertexVerificationReservation(fd);
    chmodSync(path, 0o644);
    assert.equal(reserve(), false);
    assert.throws(() => createVertexVerificationReservation(fd), /private regular file/);
    chmodSync(path, 0o600);
    linkSync(path, path + '-alias');
    assert.equal(reserve(), false);
    rmSync(path + '-alias');
    rmSync(path);
    assert.equal(reserve(), false);
  } finally { closeSync(fd); }
});
