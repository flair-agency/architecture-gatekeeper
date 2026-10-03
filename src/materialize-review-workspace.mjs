import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TextDecoder } from 'node:util';

const LIMITS = Object.freeze({ maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 });
const HASH = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function fail(message) { throw new Error(`Review workspace: ${message}`); }

function validateLimits(limits) {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits) ||
      Object.keys(limits).length !== 3 || Object.keys(limits).some(key => !Object.hasOwn(LIMITS, key))) {
    fail('explicit complete limits are required.');
  }
  for (const [key, ceiling] of Object.entries(LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ceiling) {
      fail(`${key} is invalid or exceeds the runtime ceiling.`);
    }
  }
  return { ...limits };
}

function validOriginalPath(path) {
  return typeof path === 'string' && path.length > 0 && !path.includes('\0');
}

function validateSnapshot(snapshot, limits, where) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      typeof snapshot.text !== 'string' || !['100644', '100755'].includes(snapshot.mode) ||
      !OID.test(snapshot.gitObjectId || '') || !HASH.test(snapshot.sha256 || '')) {
    fail(`${where} snapshot metadata is malformed.`);
  }
  const bytes = Buffer.from(snapshot.text, 'utf8');
  if (bytes.length > limits.maxFileBytes) fail(`${where} exceeds maxFileBytes.`);
  if (bytes.includes(0)) fail(`${where} contains binary data.`);
  let roundTrip;
  try { roundTrip = decoder.decode(bytes); } catch { fail(`${where} is not valid UTF-8.`); }
  if (roundTrip !== snapshot.text) fail(`${where} is not canonical UTF-8 text.`);
  if (createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256) fail(`${where} SHA-256 does not match its text bytes.`);
  return bytes;
}

function validatePacket(packet, limits) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) || packet.version !== 1 ||
      !packet.revisions || typeof packet.revisions !== 'object' || Array.isArray(packet.revisions) ||
      !Array.isArray(packet.files) || !Array.isArray(packet.references)) {
    fail('version 1 packet shape is required.');
  }
  const { baseSha, headSha, reviewedMergeSha } = packet.revisions;
  if (![baseSha, headSha, reviewedMergeSha].every(value => typeof value === 'string' && OID.test(value)) ||
      new Set([baseSha, headSha, reviewedMergeSha]).size !== 3) fail('revision metadata is invalid.');
  if (!packet.limits || Object.keys(LIMITS).some(key => packet.limits[key] !== limits[key])) {
    fail('packet limits must match the explicit effective limits.');
  }
  if (packet.files.length + packet.references.length > limits.maxFiles) fail('selected files exceed maxFiles.');
  const entries = [];
  const filePaths = new Set();
  for (const [index, item] of packet.files.entries()) {
    if (!item || typeof item !== 'object' || !validOriginalPath(item.path) ||
        !(item.before === null || (item.before && typeof item.before === 'object')) ||
        !(item.after === null || (item.after && typeof item.after === 'object')) ||
        (item.before === null && item.after === null)) fail(`file entry ${index + 1} is malformed.`);
    if (filePaths.has(item.path)) fail('file paths must be unique.');
    filePaths.add(item.path);
    for (const side of ['before', 'after']) {
      if (item[side] && item[side].path !== item.path) fail(`file entry ${index + 1} ${side} path does not match its file path.`);
    }
    entries.push({ kind: 'file', index, item });
  }
  const referencePaths = new Set();
  for (const [index, item] of packet.references.entries()) {
    if (!item || typeof item !== 'object' || !validOriginalPath(item.path)) fail(`reference entry ${index + 1} is malformed.`);
    if (referencePaths.has(item.path)) fail('protected reference paths must be unique.');
    referencePaths.add(item.path);
    entries.push({ kind: 'reference', index, item });
  }
  let totalBytes = 0;
  const validated = entries.map(entry => {
    const snapshots = entry.kind === 'file' ? ['before', 'after'] : ['reference'];
    const result = { ...entry, bytes: {} };
    for (const side of snapshots) {
      const snapshot = entry.kind === 'file' ? entry.item[side] : entry.item;
      if (snapshot === null) continue;
      const bytes = validateSnapshot(snapshot, limits, `${entry.kind} ${entry.index + 1} ${side}`);
      totalBytes += bytes.length;
      if (totalBytes > limits.maxTotalBytes) fail('selected snapshot bytes exceed maxTotalBytes.');
      result.bytes[side] = bytes;
    }
    return result;
  });
  if (Buffer.byteLength(JSON.stringify(packet), 'utf8') > limits.maxTotalBytes) fail('serialized packet exceeds maxTotalBytes.');
  const manifest = { version: 1, revisions: { ...packet.revisions }, limits,
    files: [], references: [] };
  for (const entry of validated) {
    if (entry.kind === 'file') {
      const record = { path: entry.item.path, before: null, after: null };
      for (const side of ['before', 'after']) {
        const snapshot = entry.item[side];
        if (snapshot === null) continue;
        const filename = `file-${String(entry.index + 1).padStart(4, '0')}-${side}.txt`;
        record[side] = { filename: `evidence/${filename}`, mode: snapshot.mode,
          gitObjectId: snapshot.gitObjectId, sha256: snapshot.sha256, present: true };
      }
      manifest.files.push(record);
    } else {
      const snapshot = entry.item;
      const filename = `reference-${String(entry.index + 1).padStart(4, '0')}.txt`;
      manifest.references.push({ path: snapshot.path, filename: `evidence/${filename}`,
        mode: snapshot.mode, gitObjectId: snapshot.gitObjectId, sha256: snapshot.sha256, present: true });
    }
  }
  const writtenBytes = totalBytes + Buffer.byteLength(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (writtenBytes > limits.maxTotalBytes) fail('complete materialized workspace exceeds maxTotalBytes.');
  return { entries: validated, manifest };
}

/**
 * Materialize a fully validated packet using only fixed ordinal filenames.
 * parentDirectory must be a trusted private parent supplied by the host caller;
 * its privacy is not verified here. The caller owns cleanup via cleanup().
 */
export function materializeReviewWorkspace(packet, { parentDirectory, limits: requestedLimits } = {}) {
  if (typeof parentDirectory !== 'string' || parentDirectory.length === 0) fail('trusted private parentDirectory is required.');
  const limits = validateLimits(requestedLimits);
  const { entries, manifest } = validatePacket(packet, limits);
  const parent = resolve(parentDirectory);
  let directory;
  try {
    directory = mkdtempSync(join(parent, 'agk-review-'));
    chmodSync(directory, 0o700);
    const evidenceDirectory = join(directory, 'evidence');
    mkdirSync(evidenceDirectory, { mode: 0o700 });
    const writeSnapshot = (filename, bytes) => {
      writeFileSync(join(evidenceDirectory, filename), bytes, { flag: 'wx', mode: 0o600 });
    };
    for (const entry of entries) {
      if (entry.kind === 'file') {
        for (const side of ['before', 'after']) {
          const snapshot = entry.item[side];
          if (snapshot === null) continue;
          const filename = `file-${String(entry.index + 1).padStart(4, '0')}-${side}.txt`;
          writeSnapshot(filename, entry.bytes[side]);
        }
      } else {
        const snapshot = entry.item;
        const filename = `reference-${String(entry.index + 1).padStart(4, '0')}.txt`;
        writeSnapshot(filename, entry.bytes.reference);
      }
    }
    writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return Object.freeze({ directory, manifestPath: join(directory, 'manifest.json'), cleanup() {
      rmSync(directory, { recursive: true, force: true });
    } });
  } catch (error) {
    if (directory) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
