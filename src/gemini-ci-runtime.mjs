/** Pinned Gemini CLI 0.62.0 runtime validation and private installation. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const PACKAGE = '@google/gemini-cli';
const VERSION = '0.62.0';
const ENTRYPOINT = 'bundle/gemini.js';
const TARBALL_INTEGRITY = 'sha512-A1rw0Tf2sHLpGncfYdaq5WaJIufKAP8il4BmHD5Yw4ewmB/Wo0vRQb2bEvx7OqyaPFPZCh0hVhcMKsICZyIBww==';
const LOCK_SHA256 = 'ffc6d0296558b2bcd12278f45c48151cf720d4cdfcbdb06a09ee87b24cf97b42';
const sha256 = value => createHash('sha256').update(value).digest('hex');
export class GeminiCiRuntimeError extends Error {
  constructor(message) { super(message); this.name = 'GeminiCiRuntimeError'; }
}
const fail = message => { throw new GeminiCiRuntimeError(message); };

/** Validate the complete authorized CLI dependency graph before installation. */
export function validatePinnedGeminiCiRuntimeLock(lockBytes) {
  if (!Buffer.isBuffer(lockBytes) || sha256(lockBytes) !== LOCK_SHA256) {
    fail('runtime package lock does not match the pinned complete dependency graph.');
  }
  let lock;
  try { lock = JSON.parse(lockBytes.toString('utf8')); }
  catch { fail('pinned runtime package lock is invalid JSON.'); }
  const dependencies = lock.packages?.['']?.dependencies;
  const packages = lock.packages;
  if (lock.lockfileVersion !== 3 || !packages || Object.keys(packages).length !== 13 ||
      !dependencies || Object.keys(dependencies).length !== 1 || dependencies[PACKAGE] !== VERSION ||
      packages[`node_modules/${PACKAGE}`]?.version !== VERSION ||
      packages[`node_modules/${PACKAGE}`]?.integrity !== TARBALL_INTEGRITY ||
      !Object.values(packages).filter(pkg => pkg?.resolved).every(pkg => typeof pkg.integrity === 'string' &&
        /^sha[0-9]+-[A-Za-z0-9+/=]+$/.test(pkg.integrity))) {
    fail('pinned runtime package lock does not contain the verified Gemini CLI dependency graph.');
  }
  return lock;
}

/**
 * Inspect package identity and entrypoint plus exact installed lock bytes.
 * This does not hash every installed transitive file; it relies on the locked
 * installer and private-directory boundary for those package bytes.
 */
export function inspectPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes } = {}) {
  if (typeof runtimeDirectory !== 'string' || !runtimeDirectory || !Buffer.isBuffer(lockBytes)) {
    fail('explicit runtime directory and authorized lock bytes are required.');
  }
  const runtimeStat = lstatSync(runtimeDirectory);
  if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink() || (runtimeStat.mode & 0o777) !== 0o700 ||
      (typeof process.getuid === 'function' && runtimeStat.uid !== process.getuid())) {
    fail('private runtime directory is not protected.');
  }
  const installedLockBytes = readFileSync(join(runtimeDirectory, 'package-lock.json'));
  validatePinnedGeminiCiRuntimeLock(installedLockBytes);
  validatePinnedGeminiCiRuntimeLock(lockBytes);
  if (!installedLockBytes.equals(lockBytes)) fail('installed runtime lock differs from the authorized complete dependency graph.');
  const scopedPackageRoot = join(runtimeDirectory, 'node_modules', '@google', 'gemini-cli');
  const packageJsonBytes = readFileSync(join(scopedPackageRoot, 'package.json'));
  const packageJson = JSON.parse(packageJsonBytes.toString('utf8'));
  if (packageJson.name !== PACKAGE || packageJson.version !== VERSION) fail('installed Gemini CLI package does not match the pinned runtime version.');
  const entry = join(scopedPackageRoot, ENTRYPOINT);
  const stat = lstatSync(entry);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('installed Gemini CLI entrypoint is not a regular file.');
  return Object.freeze({ entry, privateDirectory: runtimeDirectory, version: VERSION, cliTarballIntegrity: TARBALL_INTEGRITY,
    lockSha256: sha256(installedLockBytes), lockDeflateBase64: deflateSync(installedLockBytes).toString('base64'),
    packageJsonSha256: sha256(packageJsonBytes), entrySha256: sha256(readFileSync(entry)) });
}

/** Install the fixed package into a new 0700 directory with lifecycle scripts disabled. */
export function installPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes } = {}) {
  if (typeof runtimeDirectory !== 'string' || !runtimeDirectory || !Buffer.isBuffer(lockBytes)) {
    fail('explicit runtime directory and authorized lock bytes are required.');
  }
  let targetStat;
  try { targetStat = lstatSync(runtimeDirectory); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (targetStat) fail('private runtime target already exists; refusing reuse.');
  mkdirSync(runtimeDirectory, { mode: 0o700 });
  try {
    if ((lstatSync(runtimeDirectory).mode & 0o777) !== 0o700) fail('private runtime directory permissions are not 0700.');
    const authorizedLock = validatePinnedGeminiCiRuntimeLock(lockBytes);
    writeFileSync(join(runtimeDirectory, 'package.json'), JSON.stringify({ private: true, dependencies: authorizedLock.packages[''].dependencies }),
      { mode: 0o600, flag: 'wx' });
    writeFileSync(join(runtimeDirectory, 'package-lock.json'), lockBytes, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(runtimeDirectory, '.npmrc'), 'registry=https://registry.npmjs.org/\nignore-scripts=true\n',
      { mode: 0o600, flag: 'wx' });
    const npmEnv = { PATH: [...new Set([dirname(process.execPath), '/usr/bin', '/bin'])].join(delimiter),
      HOME: runtimeDirectory, TMPDIR: runtimeDirectory, CI: 'true', NO_COLOR: '1',
      npm_config_userconfig: join(runtimeDirectory, '.npmrc'), npm_config_globalconfig: '/dev/null',
      npm_config_registry: 'https://registry.npmjs.org/' };
    const install = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: runtimeDirectory, encoding: 'utf8', timeout: 300_000, env: npmEnv, stdio: ['ignore', 'ignore', 'ignore'],
    });
    if (install.error || install.status !== 0) fail('private runtime installation failed.');
    const installedLockBytes = readFileSync(join(runtimeDirectory, 'package-lock.json'));
    if (!installedLockBytes.equals(lockBytes)) fail('installed runtime lock differs from the authorized complete dependency graph.');
    return inspectPinnedGeminiCiRuntime({ runtimeDirectory, lockBytes });
  } catch (error) {
    rmSync(runtimeDirectory, { recursive: true, force: true });
    throw error;
  }
}
