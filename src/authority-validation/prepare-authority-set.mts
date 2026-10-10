import { constants, openSync, readSync, closeSync, fstatSync, mkdirSync, writeFileSync, rmSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { MULTI_AUTHORITY_PROFILE, materializeAuthoritySet, parseAuthorityManifest, rejectDuplicateJsonKeys, validateAuthorityLimits } from '../authority-set.mjs';
import { createGitHubAuthoritySource } from '../github-authority-source.mjs';
import type { GitHubAuthorityRequest } from '../github/github-authority-source.mts';
const MAX_LIMITS_BYTES = 4 * 1024;
const MAX_MANIFEST_INPUT_BYTES = 1024 * 1024;
export interface AuthorityLimits {
  maxManifestBytes: number;
  maxMembers: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxPromptBytes: number;
}
interface AuthorityManifest {
  authorities: Array<{ id: string; repository: string; revision: string; path: string }>;
}
function readBounded(path: string, maxBytes: number, label: string): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error(`${label} byte limit is invalid.`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) throw new Error(`${label} input must be a regular file.`);
    if (metadata.size > maxBytes) throw new Error(`${label} exceeds its input byte limit.`);
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length <= maxBytes) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > maxBytes) throw new Error(`${label} exceeds its input byte limit.`);
    return buffer.subarray(0, length);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function readLimits(path: string): unknown {
  const bytes = readBounded(path, MAX_LIMITS_BYTES, 'Limits JSON');
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const limits: unknown = JSON.parse(source);
    rejectDuplicateJsonKeys(source, 'limits');
    return limits;
  } catch (error) {
    if (/duplicate JSON key/.test((error as Error).message)) throw new Error('Limits JSON contains duplicate keys.');
    throw new Error('Limits JSON is invalid.');
  }
}
export function decodeLimits(encoded: unknown, profile = 'v1'): AuthorityLimits {
  if (typeof encoded !== 'string' || encoded.length > MAX_LIMITS_BYTES * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Encoded limits are invalid.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length > MAX_LIMITS_BYTES) throw new Error('Encoded limits are invalid.');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  rejectDuplicateJsonKeys(source, 'limits');
  // validateAuthorityLimits checks the exact limit keys and every numeric bound.
  return validateAuthorityLimits(JSON.parse(source) as unknown, profile) as AuthorityLimits;
}

function usage(): never {
  throw new Error('Usage: architecture-prepare-authority-set --manifest PATH --self-repository OWNER/REPO --self-root PATH --authority-sha SHA (--limits PATH | --limits-base64 BASE64) --output-dir PATH');
}
interface Args {
  manifest?: string;
  selfRepository?: string;
  selfRoot?: string;
  authorityRevision?: string;
  limits?: string;
  limitsBase64?: string;
  outputDir?: string;
  profile?: string;
  affectedId?: string;
  affectedPath?: string;
}

function parseArgs(args: string[]): Args {
  const values: Args = {};
  const names = new Map<string, keyof Args>([
    ['--manifest', 'manifest'], ['--self-repository', 'selfRepository'], ['--self-root', 'selfRoot'],
    ['--authority-sha', 'authorityRevision'], ['--limits', 'limits'], ['--limits-base64', 'limitsBase64'],
    ['--output-dir', 'outputDir'], ['--profile', 'profile'], ['--affected-id', 'affectedId'], ['--affected-path', 'affectedPath'],
  ]);
  for (let i = 0; i < args.length; i += 2) {
    const key = names.get(args[i]);
    if (!key || values[key] !== undefined || typeof args[i + 1] !== 'string' || args[i + 1].startsWith('--')) usage();
    values[key as keyof Args] = args[i + 1];
  }
  if (['manifest', 'selfRepository', 'selfRoot', 'authorityRevision', 'outputDir'].some(key => !values[key as keyof Args]) ||
      Boolean(values.limits) === Boolean(values.limitsBase64)) usage();
  if (values.profile === MULTI_AUTHORITY_PROFILE ? (!values.affectedId || !values.affectedPath)
    : (values.affectedId !== undefined || values.affectedPath !== undefined)) usage();
  return values;
}

export interface AffectedAuthority {
  id: string;
  path: string;
}
export interface AuthorityFetchResultView {
  repository: unknown;
  resolvedCommit: unknown;
  path: unknown;
  type: unknown;
  content: unknown;
}
export type AuthorityFetcher = (request: GitHubAuthorityRequest) => AuthorityFetchResultView | PromiseLike<AuthorityFetchResultView>;
export interface PrepareAuthoritySetInput {
  manifestPath?: string;
  manifestBytes?: Buffer;
  selfRepository: string;
  selfRoot: string;
  authorityRevision: string;
  limitsPath?: string;
  limits?: unknown;
  outputDir: string;
  token?: string;
  fetchExternal?: AuthorityFetcher;
  profile?: string;
  affectedAuthority?: AffectedAuthority;
}
export interface PreparedAuthoritySet {
  outputDir: string;
  provenance: unknown;
}
/** Materialize into a new private directory; remove it completely if any output write fails. */
export async function prepareAuthoritySet({
  manifestPath,
  manifestBytes,
  selfRepository,
  selfRoot,
  authorityRevision,
  limitsPath,
  limits,
  outputDir,
  token,
  fetchExternal,
  profile = 'v1',
  affectedAuthority,
}: PrepareAuthoritySetInput): Promise<PreparedAuthoritySet> {
  limits ??= readLimits(limitsPath as string);
  manifestBytes ??= readBounded(
    manifestPath as string,
    Math.min(MAX_MANIFEST_INPUT_BYTES, (limits as { maxManifestBytes: number }).maxManifestBytes),
    'Manifest',
  );
  const parsedManifest = parseAuthorityManifest(manifestBytes, limits, profile) as AuthorityManifest;
  if (profile === MULTI_AUTHORITY_PROFILE) {
    const affected = parsedManifest.authorities.filter(member =>
      member.repository === 'self' && member.path === affectedAuthority?.path);
    if (affected.length !== 1 || affected[0].id !== affectedAuthority?.id) {
      throw new Error('Multi-document route must select exactly its affected self member by ID and path.');
    }
  }
  const externalSelected = parsedManifest.authorities.some(member => member.repository !== 'self');
  if (externalSelected && !fetchExternal) fetchExternal = createGitHubAuthoritySource({ token });
  const result = await materializeAuthoritySet({ manifestBytes, limits, selfRepository, selfRoot, authorityRevision, fetchExternal, profile });
  const destination = resolve(outputDir);
  let created = false;
  try {
    mkdirSync(destination, { mode: 0o700 });
    created = true;
    if ((lstatSync(destination).mode & 0o777) !== 0o700) throw new Error('Output directory permissions are not private.');
    const provenance = {
      version: profile === MULTI_AUTHORITY_PROFILE ? 2 : 1,
      selfRepository,
      authorityRevision: authorityRevision.toLowerCase(),
      manifestSha256: result.manifestSha256,
      setDigest: result.setDigest,
      members: result.members.map(({ id, repository, resolvedCommit, path, byteLength, sha256 }) =>
        ({ id, repository, resolvedCommit, path, byteLength, sha256 })),
    };
    writeFileSync(resolve(destination, 'authority-prompt.md'), result.prompt, { flag: 'wx', mode: 0o600 });
    writeFileSync(resolve(destination, 'authority-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    for (const name of ['authority-prompt.md', 'authority-provenance.json']) {
      if ((lstatSync(resolve(destination, name)).mode & 0o777) !== 0o600) throw new Error('Output file permissions are not private.');
    }
    return { outputDir: destination, provenance };
  } catch (error) {
    if (created) rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function runPrepareAuthoritySetCli(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const profile = args.profile || 'v1';
  const limits = args.limits
    ? validateAuthorityLimits(readLimits(args.limits), profile)
    : decodeLimits(args.limitsBase64, profile);
  const manifestBytes = readBounded(args.manifest as string,
    Math.min(MAX_MANIFEST_INPUT_BYTES, limits.maxManifestBytes), 'Manifest');
  const parsedManifest = parseAuthorityManifest(manifestBytes, limits, profile) as AuthorityManifest;
  const externalSelected = parsedManifest.authorities.some(member => member.repository !== 'self');
  const token = externalSelected ? process.env.GATEKEEPER_SOURCE_TOKEN : undefined;
  await prepareAuthoritySet({
    manifestPath: args.manifest,
    selfRepository: args.selfRepository as string,
    selfRoot: args.selfRoot as string,
    authorityRevision: args.authorityRevision as string,
    limitsPath: args.limits,
    outputDir: args.outputDir as string,
    manifestBytes,
    limits,
    token,
    profile,
    affectedAuthority: profile === MULTI_AUTHORITY_PROFILE
      ? { id: args.affectedId as string, path: args.affectedPath as string }
      : undefined,
  });
}
