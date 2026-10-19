import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const helperUrl = new URL('../dist/git/buffered-git.mjs', import.meta.url).href;

function controlledGitFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'buffered git cwd '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'controlled executable');
  mkdirSync(bin);
  const oraclePath = join(root, 'oracle.json');
  const driverPath = join(root, 'driver.mjs');
  const gitPath = join(bin, 'git');
  writeFileSync(gitPath, `#!${process.execPath}
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.GIT_ORACLE, JSON.stringify({
  argv: process.argv.slice(2), cwd: process.cwd(), sentinel: process.env.BUFFERED_GIT_SENTINEL,
  noReplace: process.env.GIT_NO_REPLACE_OBJECTS,
}));
if (process.env.BUFFERED_GIT_SCENARIO === 'error') {
  process.stdout.write(Buffer.from('01ff00', 'hex'));
  process.stderr.write(Buffer.from('657272ff', 'hex'));
  process.exitCode = 23;
} else if (process.env.BUFFERED_GIT_SCENARIO === 'size') {
  process.stdout.write(Buffer.alloc(Number(process.env.BUFFERED_GIT_SIZE), 0x5a));
} else {
  process.stdout.write(Buffer.from('00ff800a', 'hex'));
}
`);
  chmodSync(gitPath, 0o755);
  writeFileSync(driverPath, `import { writeFileSync } from 'node:fs';
import { runBufferedGit } from ${JSON.stringify(helperUrl)};
try {
  const bytes = runBufferedGit(process.env.BUFFERED_GIT_CWD, JSON.parse(process.env.BUFFERED_GIT_ARGS));
  writeFileSync(process.env.BUFFERED_GIT_RESULT, JSON.stringify({ ok: true, isBuffer: Buffer.isBuffer(bytes),
    length: bytes.length, hex: bytes.length <= 64 ? bytes.toString('hex') : undefined,
    first: bytes[0], last: bytes[bytes.length - 1] }));
} catch (error) {
  writeFileSync(process.env.BUFFERED_GIT_RESULT, JSON.stringify({ ok: false, name: error.name,
    code: error.code, status: error.status, stdoutHex: Buffer.isBuffer(error.stdout) ? error.stdout.toString('hex') : null,
    stderrHex: Buffer.isBuffer(error.stderr) ? error.stderr.toString('hex') : null }));
}
`);
  return { root, bin, oraclePath, driverPath, gitPath };
}

function invoke(fixture, args, scenario = 'binary', size) {
  const resultPath = join(fixture.root, 'result.json');
  const env = {
    ...process.env,
    PATH: `${fixture.bin}${delimiter}${dirname(process.execPath)}${delimiter}${process.env.PATH || ''}`,
    BUFFERED_GIT_CWD: fixture.root,
    BUFFERED_GIT_ARGS: JSON.stringify(args),
    BUFFERED_GIT_RESULT: resultPath,
    BUFFERED_GIT_SCENARIO: scenario,
    BUFFERED_GIT_SENTINEL: 'inherited marker with spaces',
    GIT_NO_REPLACE_OBJECTS: '0',
    GIT_ORACLE: fixture.oraclePath,
    ...(size === undefined ? {} : { BUFFERED_GIT_SIZE: String(size) }),
  };
  const child = spawnSync(process.execPath, [fixture.driverPath], {
    // A missing cwd binding must not pass by inheriting the requested root.
    cwd: fixture.bin,
    env,
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  return {
    call: JSON.parse(readFileSync(fixture.oraclePath, 'utf8')),
    result: JSON.parse(readFileSync(resultPath, 'utf8')),
  };
}

test('buffered Git preserves ordered argv, cwd, inherited environment, and invalid UTF-8 bytes', t => {
  const fixture = controlledGitFixture(t);
  const args = ['diff', '--name-only', '-z', '--no-renames', 'base sha', 'reviewed sha', '--', 'path with spaces/file'];
  const { call, result } = invoke(fixture, args);
  assert.deepEqual(call, {
    argv: args,
    cwd: fixture.root,
    sentinel: 'inherited marker with spaces',
    noReplace: '0',
  });
  assert.deepEqual(result, { ok: true, isBuffer: true, length: 4, hex: '00ff800a', first: 0, last: 10 });
});

test('buffered Git preserves native nonzero status and captured stdout/stderr bytes', t => {
  const fixture = controlledGitFixture(t);
  const { call, result } = invoke(fixture, ['cat-file', 'blob', 'object-id'], 'error');
  assert.deepEqual(call.argv, ['cat-file', 'blob', 'object-id']);
  assert.equal(call.cwd, fixture.root);
  assert.deepEqual(result, {
    ok: false,
    name: 'Error',
    status: 23,
    stdoutHex: '01ff00',
    stderrHex: '657272ff',
  });
});

test('buffered Git accepts exactly the configured two-megabyte stdout limit', t => {
  const fixture = controlledGitFixture(t);
  const { result } = invoke(fixture, ['show', 'revision:path'], 'size', 2_000_000);
  assert.equal(result.ok, true);
  assert.equal(result.isBuffer, true);
  assert.equal(result.length, 2_000_000);
  assert.equal(result.first, 0x5a);
  assert.equal(result.last, 0x5a);
});

test('buffered Git retains native output-cap failure above two megabytes', t => {
  const fixture = controlledGitFixture(t);
  const { result } = invoke(fixture, ['show', 'revision:path'], 'size', 2_000_001);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ENOBUFS');
});
