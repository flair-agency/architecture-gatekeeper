/** One private hosted Gemini verification for Issue334. */
import { createHash, createCipheriv, publicEncrypt, randomBytes, constants } from 'node:crypto';
import childProcess, { execFileSync, spawnSync } from 'node:child_process';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import {
  closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync,
  readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync, writeSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { prepareGeminiCiVerificationInput } from '../dist/prepare-gemini-ci-verification-input.mjs';

const REPOSITORY = 'flair-agency/architecture-gatekeeper';
const BRANCH = 'feature/gemini-ci';
const WORKFLOW_PATH = '.github/workflows/issue334-gemini-verification.yml';
const POLICY_PATH = '.codex/gatekeeper/gemini-verification-policy.json';
const PROMPT_PATH = '.codex/gatekeeper/ci-prompt.md';
const SCHEMA_PATH = '.codex/gatekeeper/ci-decision.schema.json';
const VALIDATION_PATH = '.codex/gatekeeper/decision.validation.json';
const RUNTIME_LOCK_PATH = '.codex/gatekeeper/gemini-verification-package-lock.json';
const EXPECTED_PREDECESSOR_SHA = 'acc78d31ede7e68a549c7158a2a613321820a387';
const PUBLIC_KEY_PEM='-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAnZVHMkUmRdmwVbfIAhb+\nQAAIezgXahPDeOGtQvy6P2kn97TIhekWCYTO7krC3aUUpk1MvRzdxnkpJ/Z5sPXt\nrvmdwvWKcjXrtPVyd3zDJ6wJWuQigblUET+qAjZ1+YIdJnj+pRl4LM+nzHvEryX1\navwoZcL52CUh9LwiR+N8knGJMYOCFTUv5NMdx0esEk5UaadaoJquKY+iJKnExGK3\n6hbrR1KlItgRj+vBBImcwTpsJx6d6NkUSkPX2TnVqLtTQljqqBFViCTxK64pvSPW\nAbpXBNn4RJEFiTTfQczaQ9RAo1txJonYhaSX4iIAqEG1FYHm00Q6wN7tKiHdzpW7\nsXfqQ5PZWmKCkJCiMiHAx4XbRGbPxNKqclCkJRVJ4ZOGHtVzB7Btu7hI3LQFyoyK\nTEvzi+reS+xUvMd/XKmGFlXreATQqZwWP1E0m4Yv6GQsmOhSV+nmTQXdX31qe4B9\nB+/SQO4EhyCopV7ZbtwbgKtFj6TV7dkMUinpcXdXps2BAgMBAAE=\n-----END PUBLIC KEY-----\n';
const PUBLIC_KEY_SHA256 = '635e87fee174aaca8b86ae9863fdc26926f969171c67d9678b96176388e80ba3';
const CLI_TARBALL_INTEGRITY = 'sha512-A1rw0Tf2sHLpGncfYdaq5WaJIufKAP8il4BmHD5Yw4ewmB/Wo0vRQb2bEvx7OqyaPFPZCh0hVhcMKsICZyIBww==';
const RUNTIME_PACKAGE_NAME = '@google/gemini-cli';
const RUNTIME_VERSION = '0.62.0';
const AUTHORIZED_RUNTIME_LOCK_SHA256 = 'ffc6d0296558b2bcd12278f45c48151cf720d4cdfcbdb06a09ee87b24cf97b42';
const DEFENSIVE_SESSION_DISPATCH_CAP = 10;
const VERIFICATION_START_CLAIM = 'verification-start.claim';
const VERIFICATION_START_CLAIM_BYTES = Buffer.from('AGK334-VERIFICATION-START-V1\n');
const REFERENCE_PATHS = Object.freeze([
  'README.md', 'package.json', 'docs/architecture.md', 'docs/README.md',
  'src/prepared-gemini-ci-verification.mjs', 'src/gemini-cli-proxy-session.mjs',
  'src/gemini-security-proxy.mjs', 'src/gemini-cli-process.mjs',
  '.github/workflows/architecture-gate-consumer.yml',
  'scripts/issue334-gemini-verification.mjs',
  '.codex/gatekeeper/gemini-verification-package-lock.json',
]);
const WIF_ENV = Object.freeze({ token: 'AGK_VERTEX_ACCESS_TOKEN', project: 'AGK_VERTEX_PROJECT', region: 'AGK_VERTEX_LOCATION' });
const DENIED_CREDENTIAL_NAMES = Object.freeze(['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']);
const ENTRYPOINT = 'bundle/gemini.js';
const MAX_EVIDENCE_PLAINTEXT_BYTES = 2_097_152;
const MAX_JOURNAL_BYTES = 128;
const MAX_UPSTREAM_CAPTURE_BYTES = 262_144;
const MAX_UPSTREAM_RESPONSE_BYTES = 65_536;
const MAX_PROMPT_BYTES = 196_608;
const MAX_STDIO_BYTES = 65_536;

function fail(message) { throw new Error(`Issue334 verification: ${message}`); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export function validateAuthorizedRuntimeLock(lockBytes) {
  if (!Buffer.isBuffer(lockBytes) || sha256(lockBytes) !== AUTHORIZED_RUNTIME_LOCK_SHA256) {
    fail('runtime package lock does not match the pinned complete dependency graph.');
  }
  let lock;
  try { lock = JSON.parse(lockBytes.toString('utf8')); }
  catch { fail('pinned runtime package lock is invalid JSON.'); }
  const rootDependencies = lock.packages?.['']?.dependencies;
  const packages = lock.packages;
  if (lock.lockfileVersion !== 3 || !packages || Object.keys(packages).length !== 13 ||
      !rootDependencies || Object.keys(rootDependencies).length !== 1 ||
      rootDependencies[RUNTIME_PACKAGE_NAME] !== RUNTIME_VERSION ||
      packages[`node_modules/${RUNTIME_PACKAGE_NAME}`]?.version !== RUNTIME_VERSION ||
      packages[`node_modules/${RUNTIME_PACKAGE_NAME}`]?.integrity !== CLI_TARBALL_INTEGRITY ||
      !Object.values(packages).filter(pkg => pkg?.resolved).every(pkg => typeof pkg.integrity === 'string' && /^sha[0-9]+-[A-Za-z0-9+/=]+$/.test(pkg.integrity))) {
    fail('pinned runtime package lock does not contain the verified Gemini CLI dependency graph.');
  }
  return lock;
}

/** Checks consistency among observed runner metadata and Git revisions only.
 * These candidate-loaded values do not authenticate source or authorize a merge;
 * trusted coordinator admission is a separate external responsibility. */
export function validateHostedPushContext({ env, actualHeadSha, orderedParents,
  expectedPredecessorSha = EXPECTED_PREDECESSOR_SHA } = {}) {
  const workflowRef = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/${BRANCH}`;
  if (!env || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== REPOSITORY ||
      env.GITHUB_REF !== `refs/heads/${BRANCH}` || env.GITHUB_EVENT_NAME !== 'push' ||
      env.GITHUB_RUN_ATTEMPT !== '1' || env.GITHUB_WORKFLOW_REF !== workflowRef ||
      !/^[0-9]+$/.test(env.GITHUB_RUN_ID || '') || !/^[0-9]+$/.test(env.GITHUB_RUN_NUMBER || '') ||
      !/^[a-f0-9]{40}$/.test(expectedPredecessorSha) ||
      !/^[a-f0-9]{40}$/.test(actualHeadSha || '') || env.GITHUB_SHA !== actualHeadSha ||
      !Array.isArray(orderedParents) || orderedParents.length !== 2 ||
      orderedParents[0] !== expectedPredecessorSha || !/^[a-f0-9]{40}$/.test(orderedParents[1] || '') ||
      orderedParents[1] === expectedPredecessorSha) {
    fail('observed single-run feature push context is incomplete or mismatched.');
  }
  return Object.freeze({ repository: REPOSITORY, branch: BRANCH, workflowRef,
    runId: env.GITHUB_RUN_ID, runNumber: env.GITHUB_RUN_NUMBER, runAttempt: 1,
    beforeSha: orderedParents[0], workflowRequiredBeforeSha: expectedPredecessorSha, featureHeadSha: orderedParents[1], mergeSha: actualHeadSha });
}

/** Capture parent-only WIF inputs, then remove their variable names before CLI startup. */
export function captureAndRemoveWifEnvironment(env) {
  if (!env || typeof env !== 'object') fail('environment is unavailable.');
  for (const name of DENIED_CREDENTIAL_NAMES) {
    if (Object.hasOwn(env, name)) fail('Codex/OpenAI credentials are present in the verification environment.');
  }
  const token = env[WIF_ENV.token];
  const project = env[WIF_ENV.project];
  const region = env[WIF_ENV.region];
  for (const name of Object.values(WIF_ENV)) delete env[name];
  if (typeof token !== 'string' || token.length < 16 || token.length > 16_384 ||
      typeof project !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ||
      typeof region !== 'string' || !/^[a-z0-9-]{2,32}$/.test(region)) {
    fail('required parent-only Vertex credentials or scope are unavailable.');
  }
  return { token, project, region };
}

/** Never disclose the PATH or matching executable path in diagnostics. */
export function assertNoCodexExecutable(pathValue, fixedSearchPaths = ['/usr/bin', '/bin']) {
  const search = [...new Set([...(typeof pathValue === 'string' ? pathValue.split(delimiter) : []), ...fixedSearchPaths])];
  for (const directory of search) {
    if (!directory || !directory.startsWith('/')) continue;
    for (const name of ['codex', 'codex.exe']) {
      try { if (existsSync(join(directory, name)) && statSync(join(directory, name)).isFile()) fail('Codex executable is available in the hosted verifier environment.'); }
      catch (error) { if (error?.message?.startsWith('Issue334 verification:')) throw error; }
    }
  }
}

/** Create a bounded per-invocation diagnostic journal; it never authorizes or resets a session. */
export function createPrivateDispatchJournal(runtimeDirectory) {
  assertPrivateDirectory(runtimeDirectory, 'private runtime directory is not private.');
  const path = join(runtimeDirectory, `dispatch-journal-${process.pid}-${randomBytes(8).toString('hex')}.jsonl`);
  const fd = openSync(path, 'wx', 0o600);
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
    closeSync(fd); fail('private dispatch journal is not protected.');
  }
  try {
    const directoryFd = openSync(runtimeDirectory, 'r');
    try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  return Object.freeze({ path, record(count) {
    try {
      const current = fstatSync(fd);
      if (current.size + 3 > MAX_JOURNAL_BYTES || current.dev !== stat.dev || current.ino !== stat.ino) return false;
      const bytes = Buffer.from(`${count}\n`);
      if (writeSync(fd, bytes, 0, bytes.length, current.size) !== bytes.length) return false;
      fsyncSync(fd);
      return true;
    } catch { return false; }
  }, close() { closeSync(fd); } });
}

/** Durably claim the one permitted verification invocation before provider dispatch. */
export function claimSingleVerificationInvocation(runtimeDirectory) {
  assertPrivateDirectory(runtimeDirectory, 'private runtime directory is not private.');
  const claimPath = join(runtimeDirectory, VERIFICATION_START_CLAIM);
  let fd;
  try { fd = openSync(claimPath, 'wx', 0o600); }
  catch (error) {
    if (error?.code === 'EEXIST') fail('verification invocation was already claimed; refusing another run.');
    throw error;
  }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o777) !== 0o600 ||
        (typeof process.getuid === 'function' && opened.uid !== process.getuid())) fail('verification claim is not a private regular file.');
    writeFileSync(fd, VERIFICATION_START_CLAIM_BYTES);
    fsyncSync(fd);
    const written = fstatSync(fd);
    if (!written.isFile() || written.dev !== opened.dev || written.ino !== opened.ino ||
        written.size !== VERIFICATION_START_CLAIM_BYTES.length || written.nlink !== 1 ||
        (written.mode & 0o777) !== 0o600 || (typeof process.getuid === 'function' && written.uid !== process.getuid())) {
      fail('verification claim changed while being written.');
    }
  } finally { closeSync(fd); }
  const directoryFd = openSync(runtimeDirectory, 'r');
  try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  return Object.freeze({ claimed: true });
}

/** Wrap raw private evidence with the existing public-key hybrid envelope. */
export function encryptPrivateEvidence(payload, publicKeyBytes, expectedPublicKeySha256 = PUBLIC_KEY_SHA256) {
  if (!Buffer.isBuffer(publicKeyBytes) || sha256(publicKeyBytes) !== expectedPublicKeySha256) fail('evidence public-key digest does not match the pinned key.');
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  if (plaintext.length > MAX_EVIDENCE_PLAINTEXT_BYTES) fail('private evidence exceeds its 2 MiB bound.');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: publicKeyBytes, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return Buffer.from(JSON.stringify({ version: 1, algorithm: 'RSA-OAEP-SHA256+AES-256-GCM',
    publicKeySha256: expectedPublicKeySha256, iv: iv.toString('base64'), tag: tag.toString('base64'),
    wrappedKey: wrappedKey.toString('base64'), ciphertext: ciphertext.toString('base64') }));
}

export function sealPrivateEvidence(payload) {
  return encryptPrivateEvidence(payload, Buffer.from(PUBLIC_KEY_PEM, 'utf8'));
}

export function assertCompletedDecisionResult(result) {
  if (!result || result.execution?.status !== 'completed' ||
      !['PASS', 'BLOCK', 'OWNER_DECISION'].includes(result.decision?.decision)) {
    fail('review output is incomplete or has no valid semantic decision.');
  }
  return result;
}

export function redactedSummary({ context, dispatchCount, clientRequestFinishedCount, httpResponseCount, execution, decision, evidenceFile }) {
  const statuses = new Set(['completed', 'incomplete']);
  const decisionKinds = new Set(['PASS', 'BLOCK', 'OWNER_DECISION']);
  return Object.freeze({ format: 'agk334-private-verification-v1', runId: context.runId,
    runAttempt: context.runAttempt, beforeSha: context.beforeSha, featureHeadSha: context.featureHeadSha,
    mergeSha: context.mergeSha, provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
    executionStatus: statuses.has(execution?.status) ? execution.status : 'failed',
    decisionKind: decisionKinds.has(decision?.decision) ? decision.decision : null,
    dispatchCount: Number.isSafeInteger(dispatchCount) && dispatchCount >= 0 && dispatchCount <= DEFENSIVE_SESSION_DISPATCH_CAP ? dispatchCount : null,
    dispatchMaximum: DEFENSIVE_SESSION_DISPATCH_CAP,
    clientRequestFinishedCount: Number.isSafeInteger(clientRequestFinishedCount) && clientRequestFinishedCount >= 0 ? clientRequestFinishedCount : null,
    httpResponseCount: Number.isSafeInteger(httpResponseCount) && httpResponseCount >= 0 ? httpResponseCount : null,
    requestCountSemantics: 'HTTPS request finish is client-side only; remote receipt is not independently proven',
    evidenceFile: typeof evidenceFile === 'string' ? evidenceFile : null,
    interpretation: 'private post-merge verification only; not an ordinary CI acceptance result' });
}

/** Capture bounded upstream response bodies and CLI streams without request headers or request bodies. */
export function installPrivateObservation(runtimeEntrypoint) {
  const originalHttpsRequest = https.request;
  const originalSpawn = childProcess.spawn;
  const records = [];
  const cli = { spawned: false, exitCode: null, signal: null, stdoutBase64: '', stderrBase64: '',
    stdoutTruncated: false, stderrTruncated: false, errorName: null };
  let observedHttpsRequestCount = 0;
  let capturedResponseBytes = 0;
  let active = true;
  function boundedStream(target, key, truncatedKey, chunk) {
    const bytes = Buffer.from(chunk);
    const used = target[key] ? Buffer.from(target[key], 'base64').length : 0;
    const remaining = Math.max(0, MAX_STDIO_BYTES - used);
    const keep = Math.min(remaining, bytes.length);
    if (keep) target[key] = Buffer.concat([Buffer.from(target[key] || '', 'base64'), bytes.subarray(0, keep)]).toString('base64');
    if (keep < bytes.length) target[truncatedKey] = true;
  }
  https.request = function (...args) {
    const request = originalHttpsRequest.apply(this, args);
    if (!active) return request;
    const record = { sequence: records.length + 1, requestFinished: false, statusCode: null,
      responseBytesBase64: '', responseTruncated: false, errorName: null };
    records.push(record);
    request.once('finish', () => { record.requestFinished = true; observedHttpsRequestCount++; });
    request.once('response', response => {
      record.statusCode = Number.isInteger(response.statusCode) ? response.statusCode : null;
      response.on('data', chunk => {
        const bytes = Buffer.from(chunk);
        const localUsed = record.responseBytesBase64 ? Buffer.from(record.responseBytesBase64, 'base64').length : 0;
        const localRemaining = Math.max(0, MAX_UPSTREAM_RESPONSE_BYTES - localUsed);
        const totalRemaining = Math.max(0, MAX_UPSTREAM_CAPTURE_BYTES - capturedResponseBytes);
        const keep = Math.min(bytes.length, localRemaining, totalRemaining);
        if (keep) {
          record.responseBytesBase64 = Buffer.concat([Buffer.from(record.responseBytesBase64, 'base64'), bytes.subarray(0, keep)]).toString('base64');
          capturedResponseBytes += keep;
        }
        if (keep < bytes.length) record.responseTruncated = true;
      });
    });
    request.once('error', error => { record.errorName = typeof error?.name === 'string' ? error.name : 'Error'; });
    return request;
  };
  childProcess.spawn = function (file, args, options) {
    const child = originalSpawn.call(this, file, args, options);
    if (!active || file !== process.execPath || !Array.isArray(args) || args[0] !== runtimeEntrypoint) return child;
    cli.spawned = true;
    child.stdout?.on('data', chunk => boundedStream(cli, 'stdoutBase64', 'stdoutTruncated', chunk));
    child.stderr?.on('data', chunk => boundedStream(cli, 'stderrBase64', 'stderrTruncated', chunk));
    child.once('error', error => { cli.errorName = typeof error?.name === 'string' ? error.name : 'Error'; });
    child.once('close', (code, signal) => { cli.exitCode = code; cli.signal = signal; });
    return child;
  };
  syncBuiltinESMExports();
  return {
    snapshot: () => ({ requestObjectCount: records.length, clientRequestFinishedCount: observedHttpsRequestCount,
      httpResponseCount: records.filter(record => record.statusCode !== null).length,
      upstreamResponses: records.map(record => ({ ...record })), cliOutcome: { ...cli } }),
    restore() { active = false; https.request = originalHttpsRequest; childProcess.spawn = originalSpawn; syncBuiltinESMExports(); },
  };
}

function git(root, args) {
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], { encoding: 'utf8', timeout: 10_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_PAGER: 'cat' },
    stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function writePrivateEvidence(runnerTemp, encryptedBytes) {
  const directory = join(realpathSync(runnerTemp), `agk334-private-evidence-${process.pid}-${randomBytes(8).toString('hex')}`);
  mkdirSync(directory, { mode: 0o700 });
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (directoryStat.mode & 0o777) !== 0o700 ||
      (typeof process.getuid === 'function' && directoryStat.uid !== process.getuid())) fail('private evidence directory is not private.');
  const path = join(directory, 'verification.enc.json');
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, encryptedBytes);
    fsyncSync(fd);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600) fail('encrypted evidence file is not private.');
  } finally { closeSync(fd); }
  const dirFd = openSync(directory, 'r');
  try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
  return { directory, path };
}

function assertPrivateDirectory(path, message) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid())) fail(message);
  return stat;
}

function readDispatchJournalEntries(runtimeDirectory) {
  const runtimeStat = assertPrivateDirectory(runtimeDirectory, 'private runtime directory is not private.');
  const entries = readdirSync(runtimeDirectory, { withFileTypes: true });
  const possible = entries.filter(entry => entry.name.startsWith('dispatch-journal-'));
  if (possible.length > 8) fail('private dispatch journal count exceeds its bound.');
  const snapshots = [];
  for (const entry of possible) {
    if (!/^dispatch-journal-[0-9]+-[a-f0-9]{16}\.jsonl$/.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) fail('private dispatch journal entry is malformed.');
    const path = join(runtimeDirectory, entry.name);
    const pathStat = lstatSync(path);
    if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1 || pathStat.size > MAX_JOURNAL_BYTES ||
        (pathStat.mode & 0o777) !== 0o600 || pathStat.dev !== runtimeStat.dev ||
        (typeof process.getuid === 'function' && pathStat.uid !== process.getuid())) fail('private dispatch journal is invalid.');
    const fd = openSync(path, 'r');
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.dev !== pathStat.dev || opened.ino !== pathStat.ino || opened.nlink !== 1 ||
          opened.size !== pathStat.size || opened.size > MAX_JOURNAL_BYTES || (opened.mode & 0o777) !== 0o600 ||
          (typeof process.getuid === 'function' && opened.uid !== process.getuid())) fail('opened private dispatch journal identity changed.');
      const bytes = Buffer.alloc(opened.size);
      if (readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) fail('private dispatch journal read is incomplete.');
      const afterRead = fstatSync(fd);
      if (afterRead.dev !== opened.dev || afterRead.ino !== opened.ino || afterRead.nlink !== 1 ||
          afterRead.size !== opened.size || (afterRead.mode & 0o777) !== 0o600 ||
          (typeof process.getuid === 'function' && afterRead.uid !== process.getuid())) fail('private dispatch journal changed while checkpointing.');
      snapshots.push({ file: entry.name, bytesBase64: bytes.toString('base64') });
    } finally { closeSync(fd); }
  }
  return snapshots;
}

function writePrivateCheckpoint(runtimeDirectory, encryptedBytes) {
  const directory = join(runtimeDirectory, 'agk334-private-evidence-checkpoint');
  mkdirSync(directory, { mode: 0o700 });
  const directoryStat = assertPrivateDirectory(directory, 'private checkpoint directory is not private.');
  const path = join(directory, 'dispatch-checkpoint.enc.json');
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, encryptedBytes);
    fsyncSync(fd);
    const fileStat = fstatSync(fd);
    if (!fileStat.isFile() || fileStat.nlink !== 1 || (fileStat.mode & 0o777) !== 0o600 ||
        (typeof process.getuid === 'function' && fileStat.uid !== process.getuid())) fail('encrypted checkpoint file is not private.');
  } finally { closeSync(fd); }
  const directoryFd = openSync(directory, 'r');
  try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  const runtimeFd = openSync(runtimeDirectory, 'r');
  try { fsyncSync(runtimeFd); } finally { closeSync(runtimeFd); }
  return Object.freeze({ path, directoryDevice: String(directoryStat.dev), directoryInode: String(directoryStat.ino) });
}

/** Seal bounded invocation diagnostics after completion or interruption. */
export function sealPrivateDispatchCheckpoint() {
  const root = realpathSync(process.cwd());
  const runtimeDirectory = join(root, '.agk334-private-runtime');
  let runtimeStat;
  try { runtimeStat = lstatSync(runtimeDirectory); }
  catch (error) {
    if (error?.code === 'ENOENT') return Object.freeze({ status: 'no-runtime', dispatchCount: null, evidenceFile: null });
    throw error;
  }
  if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink()) fail('private runtime directory is not a regular directory.');
  const journals = readDispatchJournalEntries(runtimeDirectory);
  const counts = journals.map(journal => {
    const text = Buffer.from(journal.bytesBase64, 'base64').toString('utf8');
    for (let count = 0; count <= DEFENSIVE_SESSION_DISPATCH_CAP; count++) {
      if (text === Array.from({ length: count }, (_, index) => `${index + 1}\n`).join('')) return count;
    }
    return null;
  });
  const count = journals.length !== 1 || counts.includes(null) ? null : counts[0];
  const payload = { format: 'agk334-private-dispatch-checkpoint-v1', journals };
  const checkpoint = writePrivateCheckpoint(runtimeDirectory, sealPrivateEvidence(payload));
  return Object.freeze({ status: 'sealed', dispatchCount: count, journalCount: journals.length,
    evidenceFile: 'agk334-private-evidence-checkpoint/dispatch-checkpoint.enc.json', checkpointDevice: checkpoint.directoryDevice,
    checkpointInode: checkpoint.directoryInode });
}

function runtimeEntryPoint(root) {
  const runtimeRoot = join(root, '.agk334-private-runtime');
  const runtimeStat = lstatSync(runtimeRoot);
  if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink() || (runtimeStat.mode & 0o777) !== 0o700 ||
      (typeof process.getuid === 'function' && runtimeStat.uid !== process.getuid())) fail('private runtime directory is not protected.');
  const installedLockBytes = readFileSync(join(runtimeRoot, 'package-lock.json'));
  validateAuthorizedRuntimeLock(installedLockBytes);
  const packageRoot = join(runtimeRoot, 'node_modules', '@google', 'gemini-cli');
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (packageJson.name !== RUNTIME_PACKAGE_NAME || packageJson.version !== RUNTIME_VERSION) fail('installed Gemini CLI package does not match the pinned runtime version.');
  const entry = join(packageRoot, ENTRYPOINT);
  const stat = lstatSync(entry);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('installed Gemini CLI entrypoint is not a regular file.');
  return { entry, privateDirectory: runtimeRoot, version: RUNTIME_VERSION, cliTarballIntegrity: CLI_TARBALL_INTEGRITY,
    lockSha256: sha256(installedLockBytes), lockDeflateBase64: deflateSync(installedLockBytes).toString('base64'),
    packageJsonSha256: sha256(readFileSync(join(packageRoot, 'package.json'))), entrySha256: sha256(readFileSync(entry)) };
}

function readPushContextConsistency(root, env) {
  if (resolve(env.GITHUB_WORKSPACE || '') !== root) fail('workspace must match the checked-out source root.');
  const actualHeadSha = git(root, ['rev-parse', 'HEAD']);
  const orderedParents = git(root, ['rev-list', '--parents', '-n', '1', actualHeadSha]).split(/\s+/).slice(1);
  return validateHostedPushContext({ env, actualHeadSha, orderedParents });
}

/** Install mode is a separate pre-WIF step. The CLI tarball integrity is pinned from the prior authenticated PoC. */
export function installPinnedRuntime(root, env = process.env) {
  if (Object.values(WIF_ENV).some(name => Object.hasOwn(env, name)) || DENIED_CREDENTIAL_NAMES.some(name => Object.hasOwn(env, name))) {
    fail('runtime installation must finish before provider credentials are present.');
  }
  const target = join(root, '.agk334-private-runtime');
  try { lstatSync(target); fail('private runtime target already exists; refusing reuse.'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  mkdirSync(target, { mode: 0o700 });
  try {
    if ((lstatSync(target).mode & 0o777) !== 0o700) fail('private runtime directory permissions are not 0700.');
    const lockBytes = readFileSync(join(root, RUNTIME_LOCK_PATH));
    const authorizedLock = validateAuthorizedRuntimeLock(lockBytes);
    writeFileSync(join(target, 'package.json'), JSON.stringify({ private: true, dependencies: authorizedLock.packages[''].dependencies }),
      { mode: 0o600, flag: 'wx' });
    writeFileSync(join(target, 'package-lock.json'), lockBytes, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(target, '.npmrc'), 'registry=https://registry.npmjs.org/\nignore-scripts=true\n', { mode: 0o600, flag: 'wx' });
    const npmEnv = { PATH: [...new Set([dirname(process.execPath), '/usr/bin', '/bin'])].join(delimiter),
      HOME: target, TMPDIR: target, CI: 'true', NO_COLOR: '1', npm_config_userconfig: join(target, '.npmrc'),
      npm_config_globalconfig: '/dev/null', npm_config_registry: 'https://registry.npmjs.org/' };
    const install = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: target, encoding: 'utf8', timeout: 300_000, env: npmEnv, stdio: ['ignore', 'ignore', 'ignore'],
    });
    if (install.error || install.status !== 0) fail('private runtime installation failed.');
    const installedLockBytes = readFileSync(join(target, 'package-lock.json'));
    if (!installedLockBytes.equals(lockBytes)) fail('installed runtime lock differs from the authorized complete dependency graph.');
    return Object.freeze(runtimeEntryPoint(root));
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

/** Fixed adapter composition for the selected producer output and one parent-only bearer credential. */
export function buildPreparedVerificationCall({ prepared, credential, runtimeEntry, runnerTemp }) {
  if (!prepared || !credential || !runtimeEntry || typeof runnerTemp !== 'string') fail('complete prepared execution inputs are required.');
  return { reviewInput: {
    protectedPromptText: prepared.protectedPromptText,
    protectedDecisionSchemaText: prepared.protectedDecisionSchemaText,
    protectedReviewer: prepared.protectedReviewer,
    proxySessionOptions: { packet: prepared.packet, workspaceLimits: prepared.workspaceLimits,
      workspaceParentDirectory: runnerTemp,
      processOptions: { cliEntrypoint: runtimeEntry, privateParentDirectory: runnerTemp,
        model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM', maxOutputTokens: 16_384,
        project: credential.project, region: credential.region, timeoutMs: 180_000,
        maxPromptBytes: MAX_PROMPT_BYTES, maxStdoutBytes: MAX_STDIO_BYTES, maxStderrBytes: MAX_STDIO_BYTES },
      credentials: { type: 'bearer', value: credential.token } },
  }, authorityProvenance: prepared.authorityProvenance, validationRules: prepared.validationRules,
    maxResponseBytes: prepared.maxResponseBytes, maxSchemaBytes: prepared.maxSchemaBytes };
}

/** One invocation with no retry path, fallback, or output-path selector. */
export async function runOneHostedVerification({ env = process.env, cwd = process.cwd() } = {}) {
  const root = realpathSync(cwd);
  const context = readPushContextConsistency(root, env);
  if (context.beforeSha !== EXPECTED_PREDECESSOR_SHA) fail('observed push predecessor does not match the fixed verification base.');
  const runtime = runtimeEntryPoint(root);
  claimSingleVerificationInvocation(runtime.privateDirectory);
  assertNoCodexExecutable(env.PATH, [dirname(process.execPath), '/usr/bin', '/bin']);
  let credential = captureAndRemoveWifEnvironment(env);
  // This launcher owns the fixed private install directory; no environment
  // variable or model/candidate value selects a filesystem sink.
  const runnerTemp = runtime.privateDirectory;
  let journal;
  let prepared;
  let result;
  let failure;
  let dispatchDiagnostics = null;
  let observation = null;
  try {
    prepared = await prepareGeminiCiVerificationInput({ root, repository: REPOSITORY, baseBranch: BRANCH,
      baseSha: context.beforeSha, headSha: context.featureHeadSha, reviewedSha: context.mergeSha,
      policyPath: POLICY_PATH, promptPath: PROMPT_PATH, schemaPath: SCHEMA_PATH, validationPath: VALIDATION_PATH,
      referencePaths: [...REFERENCE_PATHS] });
    journal = createPrivateDispatchJournal(runtime.privateDirectory);
    observation = installPrivateObservation(runtime.entry);
    const runInput = buildPreparedVerificationCall({ prepared, credential, runtimeEntry: runtime.entry, runnerTemp });
    const { runPreparedGeminiCiVerification } = await import('../dist/prepared-gemini-ci-verification.mjs');
    result = assertCompletedDecisionResult(await runPreparedGeminiCiVerification(runInput, journal.record));
    dispatchDiagnostics = result.dispatchDiagnostics;
  } catch (error) { failure = error; }
  finally {
    if (journal) journal.close();
  }
  try {
    const evidencePayload = {
      format: 'agk334-private-verification-evidence-v1', context, runtime,
      inputBindings: prepared?.bindings ?? null,
      exactPreparedInput: prepared ? { protectedPromptText: prepared.protectedPromptText,
        protectedDecisionSchemaText: prepared.protectedDecisionSchemaText, packet: prepared.packet,
        authorityProvenance: prepared.authorityProvenance, validationRules: prepared.validationRules } : null,
      outcome: failure ? { state: 'failed', errorName: failure.name, message: String(failure.message), stack: String(failure.stack ?? '') } : {
        state: result?.execution?.status ?? 'unknown', execution: result?.execution ?? null,
        rawResponseBase64: result?.execution?.responseBytes ? Buffer.from(result.execution.responseBytes).toString('base64') : null,
        decision: result?.decision ?? null,
      },
      dispatchDiagnostics: dispatchDiagnostics ?? null,
      observation: observation?.snapshot() ?? { requestObjectCount: 0, clientRequestFinishedCount: 0, httpResponseCount: 0, upstreamResponses: [], cliOutcome: null },
    };
    if (Buffer.byteLength(JSON.stringify(evidencePayload), 'utf8') > MAX_EVIDENCE_PLAINTEXT_BYTES) fail('private evidence exceeds its 2 MiB bound.');
    const evidence = writePrivateEvidence(runnerTemp, sealPrivateEvidence(evidencePayload));
    const observationSummary = observation?.snapshot() ?? { clientRequestFinishedCount: 0, httpResponseCount: 0 };
    const summary = redactedSummary({ context, dispatchCount: dispatchDiagnostics?.count ?? null, clientRequestFinishedCount: observationSummary.clientRequestFinishedCount,
      httpResponseCount: observationSummary.httpResponseCount, execution: result?.execution, decision: result?.decision, evidenceFile: 'verification.enc.json' });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (failure) fail('hosted verification failed; private encrypted evidence was retained.');
    return Object.freeze({ summary, encryptedEvidencePath: evidence.path });
  } finally {
    credential = null;
    observation?.restore();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const root = realpathSync(process.cwd());
  const mode = argv[0];
  if (argv.length !== 1 || !['install-runtime', 'verify', 'seal-checkpoint'].includes(mode)) fail('select exactly one supported command.');
  if (mode === 'install-runtime') {
    readPushContextConsistency(root, process.env);
    const result = installPinnedRuntime(root);
    process.stdout.write(`${JSON.stringify({ mode, version: result.version, lockSha256: result.lockSha256,
      packageJsonSha256: result.packageJsonSha256, entrySha256: result.entrySha256 })}\n`);
    return;
  }
  if (mode === 'seal-checkpoint') {
    const checkpoint = sealPrivateDispatchCheckpoint();
    process.stdout.write(`${JSON.stringify({ mode, ...checkpoint })}\n`);
    return;
  }
  // The workflow uploads encrypted evidence before its always-run cleanup step.
  await runOneHostedVerification();
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write('Issue334 hosted verification failed. See the encrypted private evidence artifact.\n'); process.exitCode = 1; });
}
