import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareOrdinaryGeminiCiRuntime } from '../dist/ordinary-gemini-ci-launcher.mjs';

const lockPath = '.codex/gatekeeper/gemini-verification-package-lock.json';
const lockBytes = readFileSync(new URL('../.codex/gatekeeper/gemini-verification-package-lock.json', import.meta.url));
const packageDirectory = directory => join(directory, 'node_modules', '@google', 'gemini-cli');
const vertexKeys = ['AGK_VERTEX_ACCESS_TOKEN', 'AGK_VERTEX_PROJECT', 'AGK_VERTEX_LOCATION'];

function git(root, ...args) {
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim();
}

function put(root, path, bytes) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function commit(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function fixture(t, { lock = lockBytes, candidateLock } = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'ordinary-gemini-runtime-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'checkout');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  put(root, 'README.fixture', 'protected base fixture\n');
  if (lock !== null) put(root, lockPath, lock);
  const baseSha = commit(root, 'protected base');
  if (candidateLock !== undefined) {
    put(root, lockPath, candidateLock);
    commit(root, 'candidate changes runtime lock');
  }
  return { parent, root, baseSha, runtimeDirectory: join(parent, 'runtime') };
}

function withCleanVertexEnvironment(t, fn) {
  const previous = Object.fromEntries(vertexKeys.map(key => [key, process.env[key]]));
  for (const key of vertexKeys) delete process.env[key];
  t.after(() => {
    for (const key of vertexKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  return fn();
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

function fakeNpmInstall(cwd) {
  const directory = packageDirectory(cwd);
  mkdirSync(join(directory, 'bundle'), { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@google/gemini-cli', version: '0.62.0' }));
  writeFileSync(join(directory, 'bundle', 'gemini.js'), 'fixture cli entrypoint');
}

test('installs pinned runtime from the lock committed at base despite a changed candidate lock', t => withCleanVertexEnvironment(t, () => {
  const f = fixture(t, { candidateLock: Buffer.from('{"candidate":"changed lock"}') });
  const calls = withNpmMock(t, (command, args, options) => {
    assert.equal(command, 'npm');
    assert.deepEqual(args, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    assert.equal(options.cwd, f.runtimeDirectory);
    assert.deepEqual(Object.keys(options.env).sort(), [
      'CI', 'HOME', 'NO_COLOR', 'PATH', 'TMPDIR', 'npm_config_globalconfig', 'npm_config_registry', 'npm_config_userconfig',
    ].sort());
    assert.equal(options.env.HOME, f.runtimeDirectory);
    assert.equal(options.env.TMPDIR, f.runtimeDirectory);
    assert.equal(options.env.CI, 'true');
    assert.equal(options.env.npm_config_globalconfig, '/dev/null');
    assert.equal(readFileSync(join(f.runtimeDirectory, '.npmrc'), 'utf8'),
      'registry=https://registry.npmjs.org/\nignore-scripts=true\n');
    fakeNpmInstall(options.cwd);
    return { status: 0 };
  });
  const result = prepareOrdinaryGeminiCiRuntime({ root: f.root, baseSha: f.baseSha, runtimeDirectory: f.runtimeDirectory });
  assert.equal(calls.length, 1);
  assert.equal(result.version, '0.62.0');
  assert.equal(result.entry, join(packageDirectory(f.runtimeDirectory), 'bundle', 'gemini.js'));
  assert.equal(result.lockSha256, 'ffc6d0296558b2bcd12278f45c48151cf720d4cdfcbdb06a09ee87b24cf97b42');
  assert.equal(result.packageJsonSha256,
    createHash('sha256').update(readFileSync(join(packageDirectory(f.runtimeDirectory), 'package.json'))).digest('hex'));
}));

test('missing or changed base lock fails before npm and leaves no runtime target', t => withCleanVertexEnvironment(t, () => {
  const missing = fixture(t, { lock: null });
  const changed = fixture(t, { lock: Buffer.from('{"changed":"protected lock"}') });
  let calls = 0;
  withNpmMock(t, () => { calls++; return { status: 0 }; });
  assert.throws(() => prepareOrdinaryGeminiCiRuntime({ root: missing.root, baseSha: missing.baseSha,
    runtimeDirectory: missing.runtimeDirectory }), /missing or ambiguous/);
  assert.equal(existsSync(missing.runtimeDirectory), false);
  assert.throws(() => prepareOrdinaryGeminiCiRuntime({ root: changed.root, baseSha: changed.baseSha,
    runtimeDirectory: changed.runtimeDirectory }), /pinned complete dependency graph/);
  assert.equal(existsSync(changed.runtimeDirectory), false);
  assert.equal(calls, 0);
}));

test('rejects malformed records, accessors, proxies, and malformed fields before Git or npm', t => withCleanVertexEnvironment(t, () => {
  const f = fixture(t);
  let calls = 0;
  withNpmMock(t, () => { calls++; return { status: 0 }; });
  const valid = { root: f.root, baseSha: f.baseSha, runtimeDirectory: f.runtimeDirectory };
  assert.throws(() => prepareOrdinaryGeminiCiRuntime(null), /plain data record/);
  assert.throws(() => prepareOrdinaryGeminiCiRuntime(new Proxy(valid, {})), /plain data record/);
  const accessor = { root: f.root, baseSha: f.baseSha, runtimeDirectory: f.runtimeDirectory };
  Object.defineProperty(accessor, 'root', { enumerable: true, get() { throw new Error('getter ran'); } });
  assert.throws(() => prepareOrdinaryGeminiCiRuntime(accessor), /unsupported or missing fields/);
  for (const input of [
    { ...valid, extra: true },
    { ...valid, baseSha: f.baseSha.toUpperCase() },
    { ...valid, baseSha: 'a'.repeat(39) },
    { ...valid, root: '' },
    { ...valid, runtimeDirectory: '' },
  ]) assert.throws(() => prepareOrdinaryGeminiCiRuntime(input));
  assert.equal(calls, 0);
}));

test('rejects any present Vertex credential variable and existing target before installation', t => {
  const f = fixture(t);
  for (const key of vertexKeys) {
    const previous = process.env[key];
    process.env[key] = '';
    try {
      assert.throws(() => prepareOrdinaryGeminiCiRuntime({ root: f.root, baseSha: f.baseSha,
        runtimeDirectory: f.runtimeDirectory }), /before Vertex credentials/);
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
  mkdirSync(f.runtimeDirectory);
  let calls = 0;
  const original = childProcess.spawnSync;
  childProcess.spawnSync = () => { calls++; return { status: 0 }; };
  syncBuiltinESMExports();
  try {
    withCleanVertexEnvironment(t, () => assert.throws(() => prepareOrdinaryGeminiCiRuntime({ root: f.root,
      baseSha: f.baseSha, runtimeDirectory: f.runtimeDirectory }), /refusing reuse/));
  } finally {
    childProcess.spawnSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(calls, 0);
  assert.equal(existsSync(f.runtimeDirectory), true);
});

test('failed npm installation cleans up the new target', t => withCleanVertexEnvironment(t, () => {
  const f = fixture(t);
  const calls = withNpmMock(t, () => ({ status: 1 }));
  assert.throws(() => prepareOrdinaryGeminiCiRuntime({ root: f.root, baseSha: f.baseSha,
    runtimeDirectory: f.runtimeDirectory }), /installation failed/);
  assert.equal(calls.length, 1);
  assert.equal(existsSync(f.runtimeDirectory), false);
}));
