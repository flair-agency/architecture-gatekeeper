import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { installPinnedRuntime } from '../scripts/issue334-gemini-verification.mjs';
import {
  installPinnedGeminiCiRuntime,
  inspectPinnedGeminiCiRuntime,
  validatePinnedGeminiCiRuntimeLock,
} from '../dist/gemini-ci-runtime.mjs';

const lockBytes = readFileSync(new URL('../.codex/gatekeeper/gemini-verification-package-lock.json', import.meta.url));
const packageRoot = directory => join(directory, 'node_modules', '@google', 'gemini-cli');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agk-gemini-runtime-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function fakeNpmInstall(cwd) {
  const packageDirectory = packageRoot(cwd);
  mkdirSync(join(packageDirectory, 'bundle'), { recursive: true });
  writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify({ name: '@google/gemini-cli', version: '0.62.0' }));
  writeFileSync(join(packageDirectory, 'bundle', 'gemini.js'), 'fixture cli entrypoint');
}

function fakeNpmRoot(root) {
  const lockPath = join(root, '.codex', 'gatekeeper', 'gemini-verification-package-lock.json');
  mkdirSync(join(root, '.codex', 'gatekeeper'), { recursive: true });
  writeFileSync(lockPath, lockBytes);
  return lockPath;
}

function withNpmMock(t, behavior) {
  const original = childProcess.spawnSync;
  const calls = [];
  childProcess.spawnSync = (command, args, options) => {
    calls.push({ command, args, options });
    return behavior(command, args, options);
  };
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawnSync = original; syncBuiltinESMExports(); });
  return calls;
}

test('validates the complete pinned CLI dependency graph and rejects lock mutation', () => {
  const lock = validatePinnedGeminiCiRuntimeLock(lockBytes);
  assert.equal(lock.packages['node_modules/@google/gemini-cli'].version, '0.62.0');
  const changed = Buffer.from(lockBytes);
  changed[changed.length - 2] ^= 1;
  assert.throws(() => validatePinnedGeminiCiRuntimeLock(changed), /pinned complete dependency graph/);
});

test('installs into a new private directory with fixed npm command and sanitized environment', t => {
  const root = fixture(t);
  const runtimeDirectory = join(root, 'runtime');
  const calls = withNpmMock(t, (command, args, options) => {
    assert.equal(command, 'npm');
    assert.deepEqual(args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.equal(options.cwd, runtimeDirectory);
    assert.equal(options.timeout, 300_000);
    assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore']);
    assert.equal(options.env.CI, 'true');
    assert.equal(options.env.HOME, runtimeDirectory);
    assert.equal(options.env.TMPDIR, runtimeDirectory);
    assert.equal(options.env.npm_config_globalconfig, '/dev/null');
    assert.deepEqual(Object.keys(options.env).sort(), [
      'CI', 'HOME', 'NO_COLOR', 'PATH', 'TMPDIR', 'npm_config_globalconfig', 'npm_config_registry', 'npm_config_userconfig',
    ].sort());
    assert.equal(readFileSync(join(runtimeDirectory, '.npmrc'), 'utf8'),
      'registry=https://registry.npmjs.org/\nignore-scripts=true\n');
    fakeNpmInstall(runtimeDirectory);
    return { status: 0 };
  });
  const result = installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes });
  assert.equal(calls.length, 1);
  assert.equal(result.version, '0.62.0');
  assert.equal(result.entry, join(packageRoot(runtimeDirectory), 'bundle', 'gemini.js'));
  assert.equal(result.lockSha256, 'ffc6d0296558b2bcd12278f45c48151cf720d4cdfcbdb06a09ee87b24cf97b42');
  assert.equal(inflateSync(Buffer.from(result.lockDeflateBase64, 'base64')).equals(lockBytes), true);
  assert.equal(result.packageJsonSha256, createHash('sha256').update(readFileSync(join(packageRoot(runtimeDirectory), 'package.json'))).digest('hex'));
  assert.equal(result.entrySha256, createHash('sha256').update(readFileSync(result.entry)).digest('hex'));
  assert.equal((statSync(runtimeDirectory).mode & 0o777), 0o700);
  assert.throws(() => installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes }), /refusing reuse/);
  assert.equal(existsSync(runtimeDirectory), true, 'refusing reuse preserves the existing target');
});

test('failed installation removes its private target and never invokes another command', t => {
  const root = fixture(t);
  const runtimeDirectory = join(root, 'runtime');
  const calls = withNpmMock(t, () => ({ status: 1 }));
  assert.throws(() => installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes }), /installation failed/);
  assert.equal(calls.length, 1);
  assert.equal(existsSync(runtimeDirectory), false);
});

test('invalid authorized lock removes the created target without invoking npm', t => {
  const root = fixture(t);
  const runtimeDirectory = join(root, 'runtime');
  let calls = 0;
  withNpmMock(t, () => { calls++; return { status: 0 }; });
  assert.throws(() => installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes: Buffer.from('invalid lock') }), /dependency graph/);
  assert.equal(calls, 0);
  assert.equal(existsSync(runtimeDirectory), false);
});

test('npm spawn error and changed installed lock both clean the target without retry', t => {
  for (const failure of ['spawn-error', 'changed-lock']) {
    const root = fixture(t);
    const runtimeDirectory = join(root, failure);
    let calls = 0;
    const original = childProcess.spawnSync;
    childProcess.spawnSync = (_command, _args, options) => {
      calls++;
      if (failure === 'spawn-error') return { error: new Error('synthetic spawn failure'), status: null };
      writeFileSync(join(options.cwd, 'package-lock.json'), Buffer.from('altered lock'));
      return { status: 0 };
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes }),
        failure === 'spawn-error' ? /installation failed/ : /installed runtime lock differs/);
    } finally {
      childProcess.spawnSync = original;
      syncBuiltinESMExports();
    }
    assert.equal(calls, 1, `${failure} does not retry npm`);
    assert.equal(existsSync(runtimeDirectory), false, `${failure} removes the target`);
  }
});

test('historical install wrapper preserves native filesystem and JSON error identities', t => {
  const missingRoot = join(fixture(t), 'missing-root');
  assert.throws(() => installPinnedRuntime(missingRoot, {}), error => error?.code === 'ENOENT');

  const root = fixture(t);
  fakeNpmRoot(root);
  const original = childProcess.spawnSync;
  childProcess.spawnSync = (_command, _args, options) => {
    const directory = join(options.cwd, 'node_modules', '@google', 'gemini-cli');
    mkdirSync(join(directory, 'bundle'), { recursive: true });
    writeFileSync(join(directory, 'package.json'), '{invalid json');
    writeFileSync(join(directory, 'bundle', 'gemini.js'), 'fixture entry');
    return { status: 0 };
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => installPinnedRuntime(root, {}), error => error instanceof SyntaxError);
  } finally {
    childProcess.spawnSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(existsSync(join(root, '.agk334-private-runtime')), false);
});

test('inspection rejects unprotected directory, wrong package version, and nonregular entrypoint', t => {
  const root = fixture(t);
  const runtimeDirectory = join(root, 'runtime');
  const calls = withNpmMock(t, (_command, _args, options) => {
    fakeNpmInstall(options.cwd);
    return { status: 0 };
  });
  installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes });
  assert.equal(calls.length, 1);
  chmodSync(runtimeDirectory, 0o755);
  assert.throws(() => inspectPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes }), /not protected/);
  chmodSync(runtimeDirectory, 0o700);
  writeFileSync(join(packageRoot(runtimeDirectory), 'package.json'), JSON.stringify({ name: '@google/gemini-cli', version: '0.62.1' }));
  assert.throws(() => inspectPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes }), /pinned runtime version/);
  writeFileSync(join(packageRoot(runtimeDirectory), 'package.json'), JSON.stringify({ name: '@google/gemini-cli', version: '0.62.0' }));
  rmSync(join(packageRoot(runtimeDirectory), 'bundle', 'gemini.js'));
  mkdirSync(join(packageRoot(runtimeDirectory), 'bundle', 'gemini.js'));
  assert.throws(() => inspectPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes }), /not a regular file/);
});

test('inspection rejects a symlinked CLI entrypoint', t => {
  const root = fixture(t);
  const runtimeDirectory = join(root, 'runtime');
  const original = childProcess.spawnSync;
  childProcess.spawnSync = (_command, _args, options) => {
    const directory = packageRoot(options.cwd);
    mkdirSync(join(directory, 'bundle'), { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@google/gemini-cli', version: '0.62.0' }));
    const outside = join(root, 'outside-entry');
    writeFileSync(outside, 'outside fixture entry');
    symlinkSync(outside, join(directory, 'bundle', 'gemini.js'));
    return { status: 0 };
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes }), /not a regular file/);
  } finally {
    childProcess.spawnSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(existsSync(runtimeDirectory), false);
});
