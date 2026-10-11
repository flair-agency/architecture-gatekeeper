import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { TextDecoder } from 'node:util';

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const RUNTIME_LIMITS = Object.freeze({ maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 });
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function fail(message) { throw new Error(`Review file context: ${message}`); }

function git(root, args, maxBuffer = 1_000_000) {
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    encoding: 'buffer', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', GIT_CONFIG_NOSYSTEM: '1' },
  });
}

function validPath(path) {
  return typeof path === 'string' && path.length > 0 && !path.includes('\0') &&
    !path.startsWith('/') && !path.split('/').some(part => part === '' || part === '.' || part === '..');
}

function validateLimits(limits) {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) fail('explicit limits are required.');
  if (Object.keys(limits).some(name => !Object.hasOwn(RUNTIME_LIMITS, name))) fail('limits contain an unsupported field.');
  for (const name of Object.keys(RUNTIME_LIMITS)) {
    const value = limits[name];
    if (!Number.isSafeInteger(value) || value < 1 || value > RUNTIME_LIMITS[name]) {
      fail(`${name} is missing, invalid, or exceeds the runtime ceiling.`);
    }
  }
  return { maxFiles: limits.maxFiles, maxFileBytes: limits.maxFileBytes, maxTotalBytes: limits.maxTotalBytes };
}

function decodePath(bytes) {
  try { return utf8.decode(bytes); } catch { fail('a Git path is not valid UTF-8.'); }
}

function rawChanges(root, baseSha, reviewedSha) {
  let data;
  try {
    data = git(root, ['diff', '--raw', '-z', '--abbrev=64', '--no-renames', '--no-ext-diff', '--no-textconv',
      '--ignore-submodules=none', baseSha, reviewedSha, '--']);
  } catch { fail('the exact committed base-to-reviewed merge change list is unavailable.'); }
  const fields = [];
  let start = 0;
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] === 0) { fields.push(data.subarray(start, i)); start = i + 1; }
  }
  if (start !== data.length) fail('the raw Git change list is malformed.');
  const changes = [];
  for (let i = 0; i < fields.length;) {
    const header = fields[i++].toString('ascii');
    const match = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([a-f0-9]{40}|[a-f0-9]{64}) ([A-Z])$/.exec(header);
    if (!match || i >= fields.length) fail('a raw Git change record is malformed.');
    const path = decodePath(fields[i++]);
    if (!validPath(path) || !['M', 'A', 'D', 'T'].includes(match[5])) fail('a changed path or status is unsupported.');
    const [, oldMode, newMode, oldOid, newOid] = match;
    for (const [mode, oid] of [[oldMode, oldOid], [newMode, newOid]]) {
      if (mode !== '000000' && (!['100644', '100755'].includes(mode) || !OID.test(oid))) {
        fail(`changed path ${JSON.stringify(path)} is not a supported regular text file.`);
      }
    }
    changes.push({ path, before: oldMode === '000000' ? null : { mode: oldMode, oid: oldOid },
      after: newMode === '000000' ? null : { mode: newMode, oid: newOid } });
  }
  return changes;
}

function readBlob(root, path, entry, maxFileBytes) {
  let bytes;
  try {
    const type = utf8.decode(git(root, ['cat-file', '-t', entry.oid], 128)).trim();
    if (type !== 'blob') fail(`selected object for ${JSON.stringify(path)} is not a blob.`);
    const size = Number(utf8.decode(git(root, ['cat-file', '-s', entry.oid], 128)).trim());
    if (!Number.isSafeInteger(size) || size > maxFileBytes) fail(`file ${JSON.stringify(path)} exceeds maxFileBytes.`);
    bytes = git(root, ['cat-file', 'blob', entry.oid], maxFileBytes + 1);
  } catch (error) {
    if (error.message.startsWith('Review file context:')) throw error;
    fail(`blob for ${JSON.stringify(path)} is unavailable or exceeds its file limit.`);
  }
  if (bytes.length > maxFileBytes) fail(`file ${JSON.stringify(path)} exceeds maxFileBytes.`);
  if (bytes.includes(0)) fail(`file ${JSON.stringify(path)} contains binary data.`);
  let text;
  try { text = utf8.decode(bytes); } catch { fail(`file ${JSON.stringify(path)} is not valid UTF-8.`); }
  return { path, mode: entry.mode, gitObjectId: entry.oid,
    sha256: createHash('sha256').update(bytes).digest('hex'), text };
}

function readReference(root, baseSha, path, maxFileBytes) {
  if (!validPath(path)) fail('a protected reference path is invalid.');
  let entries;
  try {
    const literal = `:(literal)${path}`;
    entries = git(root, ['ls-tree', '-z', '--full-tree', baseSha, '--', literal], 1_000_000);
  } catch { fail(`protected reference ${JSON.stringify(path)} cannot be read from base.`); }
  let records = [];
  try { records = entries.length ? utf8.decode(entries.subarray(0, entries.length - 1)).split('\0') : []; }
  catch { fail('a base tree path is not valid UTF-8.'); }
  if (entries.length && entries[entries.length - 1] !== 0) fail('a base tree entry is malformed.');
  const exact = records.map(record => {
    const match = /^(\d{6}) (blob|commit|tree) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(record);
    return match && match[4] === path ? match : null;
  }).filter(Boolean);
  if (exact.length !== 1) fail(`protected reference ${JSON.stringify(path)} is missing or ambiguous in base.`);
  const [, mode, type, oid] = exact[0];
  if (type !== 'blob' || !['100644', '100755'].includes(mode)) fail(`protected reference ${JSON.stringify(path)} is not a regular file.`);
  return readBlob(root, path, { mode, oid }, maxFileBytes);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Build an in-memory bounded packet from caller-selected Git revisions.
 * Trusted orchestration must supply protected reference paths and effective
 * limits; this helper does not establish repository identity or policy selection.
 */
export function prepareReviewFileContext({ root, baseSha, headSha, reviewedSha, referencePaths, limits }) {
  const bounded = validateLimits(limits);
  if (!root || !SHA.test(baseSha || '') || !SHA.test(headSha || '') || !SHA.test(reviewedSha || '') ||
      new Set([baseSha, headSha, reviewedSha]).size !== 3) {
    fail('three distinct full commit revisions are required.');
  }
  let checkout;
  try { checkout = realpathSync(root); } catch { fail('Git checkout is unavailable.'); }
  try {
    for (const sha of [baseSha, headSha, reviewedSha]) {
      const type = utf8.decode(git(checkout, ['cat-file', '-t', sha], 128)).trim();
      if (type !== 'commit') fail('base, head, and reviewed revisions must identify commits.');
    }
  } catch (error) {
    if (error.message.startsWith('Review file context:')) throw error;
    fail('base, head, and reviewed commits must exist in the checkout.');
  }
  let checkedOutSha;
  try { checkedOutSha = utf8.decode(git(checkout, ['rev-parse', '--verify', 'HEAD^{commit}'], 256)).trim(); }
  catch { fail('checkout HEAD cannot be verified.'); }
  // Candidate evidence is read by immutable object ID, never from the worktree.
  if (checkedOutSha !== baseSha && checkedOutSha !== reviewedSha) fail('checkout HEAD is neither the protected base nor the reviewed merge revision.');
  let parents;
  try { parents = utf8.decode(git(checkout, ['rev-list', '--parents', '-n', '1', reviewedSha], 256)).trim().split(/\s+/); }
  catch { fail('reviewed merge commit cannot be verified.'); }
  if (parents.length !== 3 || parents[0] !== reviewedSha || parents[1] !== baseSha || parents[2] !== headSha) {
    fail('reviewed merge parents do not match the exact base and head revisions.');
  }

  const changes = rawChanges(checkout, baseSha, reviewedSha);
  if (!Array.isArray(referencePaths)) fail('explicit protected reference paths are required.');
  const refs = referencePaths.map(path => {
    if (!validPath(path)) fail('a protected reference path is invalid.');
    return path;
  });
  if (new Set(refs).size !== refs.length) fail('protected reference paths must be unique.');
  if (changes.length + refs.length > bounded.maxFiles) fail('selected files exceed maxFiles.');
  const files = changes.map(change => ({ path: change.path,
    before: change.before ? readBlob(checkout, change.path, change.before, bounded.maxFileBytes) : null,
    after: change.after ? readBlob(checkout, change.path, change.after, bounded.maxFileBytes) : null }));
  const references = refs.map(path => readReference(checkout, baseSha, path, bounded.maxFileBytes));
  const packet = { version: 1, revisions: { baseSha, headSha, reviewedMergeSha: reviewedSha }, files, references, limits: bounded };
  const serializedBytes = Buffer.byteLength(JSON.stringify(packet), 'utf8');
  if (serializedBytes > bounded.maxTotalBytes) fail('serialized review context exceeds maxTotalBytes.');
  return deepFreeze(packet);
}
