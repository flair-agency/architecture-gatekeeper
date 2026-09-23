#!/usr/bin/env node
import { openSync, readSync, closeSync, mkdirSync, writeFileSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { materializeAuthoritySet, parseAuthorityManifest } from './authority-set.mjs';
import { createGitHubAuthoritySource } from './github-authority-source.mjs';

const MAX_LIMITS_BYTES = 4 * 1024;
const MAX_MANIFEST_INPUT_BYTES = 1024 * 1024;

function readBounded(path, maxBytes, label) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error(`${label} byte limit is invalid.`);
  let descriptor;
  try {
    descriptor = openSync(path, 'r');
    const buffer = Buffer.alloc(maxBytes + 1);
    const length = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (length > maxBytes) throw new Error(`${label} exceeds its input byte limit.`);
    return buffer.subarray(0, length);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readLimits(path) {
  const bytes = readBounded(path, MAX_LIMITS_BYTES, 'Limits JSON');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Limits JSON is invalid.'); }
}

function usage() {
  throw new Error('Usage: architecture-prepare-authority-set --manifest PATH --self-repository OWNER/REPO --self-root PATH --authority-sha SHA --limits PATH --output-dir PATH');
}

function parseArgs(args) {
  const values = {};
  const names = new Map([
    ['--manifest', 'manifest'], ['--self-repository', 'selfRepository'],
    ['--self-root', 'selfRoot'], ['--authority-sha', 'authorityRevision'],
    ['--limits', 'limits'], ['--output-dir', 'outputDir'],
  ]);
  for (let i = 0; i < args.length; i += 2) {
    const key = names.get(args[i]);
    if (!key || values[key] !== undefined || typeof args[i + 1] !== 'string' || args[i + 1].startsWith('--')) usage();
    values[key] = args[i + 1];
  }
  if (Object.keys(values).length !== names.size) usage();
  return values;
}

/** Materialize into a new private directory; remove it completely if any output write fails. */
export async function prepareAuthoritySet({ manifestPath, manifestBytes, selfRepository, selfRoot, authorityRevision, limitsPath, limits, outputDir, token, fetchExternal }) {
  limits ??= readLimits(limitsPath);
  manifestBytes ??= readBounded(manifestPath, Math.min(MAX_MANIFEST_INPUT_BYTES, limits.maxManifestBytes), 'Manifest');
  const parsedManifest = parseAuthorityManifest(manifestBytes, limits);
  const externalSelected = parsedManifest.authorities.some(member => member.repository !== 'self');
  if (externalSelected && !fetchExternal) fetchExternal = createGitHubAuthoritySource({ token });
  const result = await materializeAuthoritySet({ manifestBytes, limits, selfRepository, selfRoot, authorityRevision, fetchExternal });
  const destination = resolve(outputDir);
  let created = false;
  try {
    mkdirSync(destination, { mode: 0o700 });
    created = true;
    if ((lstatSync(destination).mode & 0o777) !== 0o700) throw new Error('Output directory permissions are not private.');
    const provenance = {
      version: 1,
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
  const limits = readLimits(args.limits);
  const manifestBytes = readBounded(args.manifest, Math.min(MAX_MANIFEST_INPUT_BYTES, limits.maxManifestBytes), 'Manifest');
  const parsedManifest = parseAuthorityManifest(manifestBytes, limits);
  const externalSelected = parsedManifest.authorities.some(member => member.repository !== 'self');
  const token = externalSelected ? process.env.GATEKEEPER_SOURCE_TOKEN : undefined;
  await prepareAuthoritySet({ manifestPath: args.manifest, selfRepository: args.selfRepository, selfRoot: args.selfRoot,
    authorityRevision: args.authorityRevision, limitsPath: args.limits, outputDir: args.outputDir, manifestBytes, limits, token });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch(() => { process.stderr.write('Authority Set preparation failed.\n'); process.exitCode = 1; });
}
