import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TextDecoder } from 'node:util';

const LIMITS = Object.freeze({ maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 });
const HASH = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

type Limits = { maxFiles: unknown; maxFileBytes: unknown; maxTotalBytes: unknown };
type ValidatedEntry = { kind: 'file' | 'reference'; index: number; item: Record<string, unknown>; bytes: Record<string, Buffer> };
type ManifestFile = { path: unknown; before: null | { filename: string; mode: unknown; gitObjectId: unknown; sha256: unknown; present: true }; after: null | { filename: string; mode: unknown; gitObjectId: unknown; sha256: unknown; present: true } };
type ManifestReference = { path: unknown; filename: string; mode: unknown; gitObjectId: unknown; sha256: unknown; present: true };
type WorkspaceManifest = { version: 1; revisions: Record<string, unknown>; limits: Limits; files: ManifestFile[]; references: ManifestReference[] };

export interface MaterializeReviewWorkspaceOptions {
  readonly parentDirectory?: unknown;
  readonly limits?: unknown;
}

export interface MaterializedReviewWorkspace {
  readonly directory: string;
  readonly manifestPath: string;
  readonly cleanup: () => void;
}

function fail(message: string): never { throw new Error(`Review workspace: ${message}`); }

function validateLimits(limits: unknown): Limits {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits) ||
      Object.keys(limits).length !== 3 || Object.keys(limits).some(key => !Object.hasOwn(LIMITS, key))) {
    fail('explicit complete limits are required.');
  }
  for (const [key, ceiling] of Object.entries(LIMITS)) {
    if (!Number.isSafeInteger((limits as Record<string, unknown>)[key]) || (limits as Record<string, unknown>)[key] as number < 1 || (limits as Record<string, unknown>)[key] as number > ceiling) {
      fail(`${key} is invalid or exceeds the runtime ceiling.`);
    }
  }
  return { ...limits } as Limits;
}

function validOriginalPath(path: unknown): boolean {
  return typeof path === 'string' && path.length > 0 && !path.includes('\0');
}

function validateSnapshot(snapshot: unknown, limits: Limits, where: string): Buffer {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      typeof (snapshot as Record<string, unknown>).text !== 'string' || !['100644', '100755'].includes((snapshot as Record<string, unknown>).mode as string) ||
      !OID.test(((snapshot as Record<string, unknown>).gitObjectId as string) || '') || !HASH.test(((snapshot as Record<string, unknown>).sha256 as string) || '')) {
    fail(`${where} snapshot metadata is malformed.`);
  }
  const bytes = Buffer.from((snapshot as Record<string, unknown>).text as string, 'utf8');
  if (bytes.length > (limits.maxFileBytes as number)) fail(`${where} exceeds maxFileBytes.`);
  if (bytes.includes(0)) fail(`${where} contains binary data.`);
  let roundTrip: string;
  try { roundTrip = decoder.decode(bytes); } catch { fail(`${where} is not valid UTF-8.`); }
  if (roundTrip !== (snapshot as Record<string, unknown>).text) fail(`${where} is not canonical UTF-8 text.`);
  if (createHash('sha256').update(bytes).digest('hex') !== (snapshot as Record<string, unknown>).sha256) fail(`${where} SHA-256 does not match its text bytes.`);
  return bytes;
}

function validatePacket(packet: unknown, limits: Limits): { entries: ValidatedEntry[]; manifest: WorkspaceManifest } {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) || (packet as Record<string, unknown>).version !== 1 ||
      !(packet as Record<string, unknown>).revisions || typeof (packet as Record<string, unknown>).revisions !== 'object' || Array.isArray((packet as Record<string, unknown>).revisions) ||
      !Array.isArray((packet as Record<string, unknown>).files) || !Array.isArray((packet as Record<string, unknown>).references)) {
    fail('version 1 packet shape is required.');
  }
  const { baseSha, headSha, reviewedMergeSha } = (packet as Record<string, unknown>).revisions as Record<string, unknown>;
  if (![baseSha, headSha, reviewedMergeSha].every(value => typeof value === 'string' && OID.test(value)) ||
      new Set([baseSha, headSha, reviewedMergeSha]).size !== 3) fail('revision metadata is invalid.');
  if (!(packet as Record<string, unknown>).limits || Object.keys(LIMITS).some(key => ((packet as Record<string, unknown>).limits as Record<string, unknown>)[key] !== limits[key as keyof Limits])) {
    fail('packet limits must match the explicit effective limits.');
  }
  if (((packet as Record<string, unknown>).files as unknown[]).length + ((packet as Record<string, unknown>).references as unknown[]).length > (limits.maxFiles as number)) fail('selected files exceed maxFiles.');
  const entries: Array<{ kind: 'file' | 'reference'; index: number; item: Record<string, unknown> }> = [];
  const filePaths = new Set<unknown>();
  for (const [index, item] of ((packet as Record<string, unknown>).files as Record<string, unknown>[]).entries()) {
    if (!item || typeof item !== 'object' || !validOriginalPath((item as Record<string, unknown>).path) ||
        !(((item as Record<string, unknown>).before === null) || ((item as Record<string, unknown>).before && typeof (item as Record<string, unknown>).before === 'object')) ||
        !(((item as Record<string, unknown>).after === null) || ((item as Record<string, unknown>).after && typeof (item as Record<string, unknown>).after === 'object')) ||
        (((item as Record<string, unknown>).before === null) && ((item as Record<string, unknown>).after === null))) fail(`file entry ${index + 1} is malformed.`);
    if (filePaths.has((item as Record<string, unknown>).path)) fail('file paths must be unique.');
    filePaths.add((item as Record<string, unknown>).path);
    for (const side of ['before', 'after']) {
      if ((item as Record<string, unknown>)[side] && ((item as Record<string, unknown>)[side] as Record<string, unknown>).path !== (item as Record<string, unknown>).path) fail(`file entry ${index + 1} ${side} path does not match its file path.`);
    }
    entries.push({ kind: 'file', index, item });
  }
  const referencePaths = new Set<unknown>();
  for (const [index, item] of ((packet as Record<string, unknown>).references as Record<string, unknown>[]).entries()) {
    if (!item || typeof item !== 'object' || !validOriginalPath((item as Record<string, unknown>).path)) fail(`reference entry ${index + 1} is malformed.`);
    if (referencePaths.has((item as Record<string, unknown>).path)) fail('protected reference paths must be unique.');
    referencePaths.add((item as Record<string, unknown>).path);
    entries.push({ kind: 'reference', index, item });
  }
  let totalBytes = 0;
  const validated: ValidatedEntry[] = entries.map(entry => {
    const snapshots = entry.kind === 'file' ? ['before', 'after'] : ['reference'];
    const result: ValidatedEntry = { ...entry, bytes: {} };
    for (const side of snapshots) {
      const snapshot = entry.kind === 'file' ? entry.item[side] : entry.item;
      if (snapshot === null) continue;
      const bytes = validateSnapshot(snapshot, limits, `${entry.kind} ${entry.index + 1} ${side}`);
      totalBytes += bytes.length;
      if (totalBytes > (limits.maxTotalBytes as number)) fail('selected snapshot bytes exceed maxTotalBytes.');
      result.bytes[side] = bytes;
    }
    return result;
  });
  if (Buffer.byteLength(JSON.stringify(packet), 'utf8') > (limits.maxTotalBytes as number)) fail('serialized packet exceeds maxTotalBytes.');
  const manifest: WorkspaceManifest = { version: 1, revisions: { ...(packet as Record<string, unknown>).revisions as Record<string, unknown> }, limits,
    files: [], references: [] };
  for (const entry of validated) {
    if (entry.kind === 'file') {
      const record: ManifestFile = { path: entry.item.path, before: null, after: null };
      for (const side of ['before', 'after']) {
        const snapshot = entry.item[side] as Record<string, unknown> | null;
        if (snapshot === null) continue;
        const filename = `file-${String(entry.index + 1).padStart(4, '0')}-${side}.txt`;
        record[side as 'before' | 'after'] = { filename: `evidence/${filename}`, mode: snapshot.mode,
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
  if (writtenBytes > (limits.maxTotalBytes as number)) fail('complete materialized workspace exceeds maxTotalBytes.');
  return { entries: validated, manifest };
}

/**
 * Materialize a fully validated packet using only fixed ordinal filenames.
 * parentDirectory must be a trusted private parent supplied by the host caller;
 * its privacy is not verified here. The caller owns cleanup via cleanup().
 */
export function materializeReviewWorkspace(packet: unknown, { parentDirectory, limits: requestedLimits }: MaterializeReviewWorkspaceOptions = {}): MaterializedReviewWorkspace {
  if (typeof parentDirectory !== 'string' || parentDirectory.length === 0) fail('trusted private parentDirectory is required.');
  const limits = validateLimits(requestedLimits);
  const { entries, manifest } = validatePacket(packet, limits);
  const parent = resolve(parentDirectory);
  let directory: string | undefined;
  try {
    directory = mkdtempSync(join(parent, 'agk-review-'));
    chmodSync(directory, 0o700);
    const evidenceDirectory = join(directory, 'evidence');
    mkdirSync(evidenceDirectory, { mode: 0o700 });
    const writeSnapshot = (filename: string, bytes: Buffer) => {
      writeFileSync(join(evidenceDirectory, filename), bytes, { flag: 'wx', mode: 0o600 });
    };
    for (const entry of entries) {
      if (entry.kind === 'file') {
        for (const side of ['before', 'after']) {
          const snapshot = entry.item[side];
          if (snapshot === null) continue;
          const filename = `file-${String(entry.index + 1).padStart(4, '0')}-${side}.txt`;
          writeSnapshot(filename, entry.bytes[side] as Buffer);
        }
      } else {
        const snapshot = entry.item;
        const filename = `reference-${String(entry.index + 1).padStart(4, '0')}.txt`;
        writeSnapshot(filename, entry.bytes.reference as Buffer);
      }
    }
    writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return Object.freeze({ directory, manifestPath: join(directory, 'manifest.json'), cleanup() {
      rmSync(directory as string, { recursive: true, force: true });
    } });
  } catch (error) {
    if (directory) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
