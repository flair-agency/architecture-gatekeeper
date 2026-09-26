#!/usr/bin/env node
import { constants, openSync, readSync, closeSync, fstatSync, mkdirSync, writeFileSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MULTI_AUTHORITY_PROFILE, materializeAuthoritySet, parseAuthorityManifest, rejectDuplicateJsonKeys, validateAuthorityLimits } from './authority-set.mjs';
import { createGitHubAuthoritySource } from './github-authority-source.mjs';

const MAX_LIMITS_BYTES = 4 * 1024;
const MAX_MANIFEST_INPUT_BYTES = 1024 * 1024;

function readBounded(path, maxBytes, label) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error(`${label} byte limit is invalid.`);
  let descriptor;
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

function readLimits(path) {
  const bytes = readBounded(path, MAX_LIMITS_BYTES, 'Limits JSON');
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const limits = JSON.parse(source);
    rejectDuplicateJsonKeys(source, 'limits');
    return limits;
  } catch (error) {
    if (/duplicate JSON key/.test(error.message)) throw new Error('Limits JSON contains duplicate keys.');
    throw new Error('Limits JSON is invalid.');
  }
}

export function decodeLimits(encoded, profile = 'v1') {
  if (typeof encoded !== 'string' || encoded.length > MAX_LIMITS_BYTES * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Encoded limits are invalid.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length > MAX_LIMITS_BYTES) throw new Error('Encoded limits are invalid.');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  rejectDuplicateJsonKeys(source, 'limits');
  return validateAuthorityLimits(JSON.parse(source), profile);
}

function usage() {
  throw new Error('Usage: architecture-prepare-authority-set --manifest PATH --self-repository OWNER/REPO --self-root PATH --authority-sha SHA (--limits PATH | --limits-base64 BASE64) --output-dir PATH');
}

function parseArgs(args) {
  const values = {};
  const names = new Map([
    ['--manifest', 'manifest'], ['--self-repository', 'selfRepository'],
    ['--self-root', 'selfRoot'], ['--authority-sha', 'authorityRevision'],
    ['--limits', 'limits'], ['--limits-base64', 'limitsBase64'], ['--output-dir', 'outputDir'],
    ['--profile', 'profile'],
    ['--affected-id', 'affectedId'], ['--affected-path', 'affectedPath'],
  ]);
  for (let i = 0; i < args.length; i += 2) {
    const key = names.get(args[i]);
    if (!key || values[key] !== undefined || typeof args[i + 1] !== 'string' || args[i + 1].startsWith('--')) usage();
    values[key] = args[i + 1];
  }
  if (['manifest', 'selfRepository', 'selfRoot', 'authorityRevision', 'outputDir'].some(key => !values[key]) ||
      Boolean(values.limits) === Boolean(values.limitsBase64)) usage();
  if (values.profile === MULTI_AUTHORITY_PROFILE ? (!values.affectedId || !values.affectedPath)
    : (values.affectedId !== undefined || values.affectedPath !== undefined)) usage();
  return values;
}

/** Materialize into a new private directory; remove it completely if any output write fails. */
export async function prepareAuthoritySet({ manifestPath, manifestBytes, selfRepository, selfRoot, authorityRevision, limitsPath, limits, outputDir, token, fetchExternal, profile = 'v1', affectedAuthority }) {
  limits ??= readLimits(limitsPath);
  manifestBytes ??= readBounded(manifestPath, Math.min(MAX_MANIFEST_INPUT_BYTES, limits.maxManifestBytes), 'Manifest');
  const parsedManifest = parseAuthorityManifest(manifestBytes, limits, profile);
  if (profile === MULTI_AUTHORITY_PROFILE) {
    const affected = parsedManifest.authorities.filter(member => member.repository === 'self' && member.path === affectedAuthority?.path);
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
      members: result.members.map(({ id, repository, resolvedCommit, path, byteLength, sha256 }) => ({ id, repository, resolvedCommit, path, byteLength, sha256 })),
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = args.profile || 'v1';
  const limits = args.limits ? validateAuthorityLimits(readLimits(args.limits), profile) : decodeLimits(args.limitsBase64, profile);
  const manifestBytes = readBounded(args.manifest, Math.min(MAX_MANIFEST_INPUT_BYTES, limits.maxManifestBytes), 'Manifest');
  const parsedManifest = parseAuthorityManifest(manifestBytes, limits, profile);
  const externalSelected = parsedManifest.authorities.some(member => member.repository !== 'self');
  const token = externalSelected ? process.env.GATEKEEPER_SOURCE_TOKEN : undefined;
  await prepareAuthoritySet({ manifestPath: args.manifest, selfRepository: args.selfRepository, selfRoot: args.selfRoot,
    authorityRevision: args.authorityRevision, limitsPath: args.limits, outputDir: args.outputDir, manifestBytes, limits, token, profile,
    affectedAuthority: profile === MULTI_AUTHORITY_PROFILE ? { id: args.affectedId, path: args.affectedPath } : undefined });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch(() => { process.stderr.write('Authority Set preparation failed.\n'); process.exitCode = 1; });
}
