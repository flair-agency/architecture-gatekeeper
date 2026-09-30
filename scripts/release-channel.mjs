import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-preview\.([1-9]\d*))?$/;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

export function classifyRelease({ releaseTag, packageVersion, releaseRef, releaseSha, checkoutSha }) {
  const version = parseVersion(packageVersion);
  if (releaseTag !== `v${packageVersion}`) {
    throw new Error('release tag does not match package version');
  }
  if (releaseRef !== `refs/tags/${releaseTag}`) {
    throw new Error('release ref does not match release tag');
  }
  if (
    !SHA_PATTERN.test(releaseSha) ||
    !SHA_PATTERN.test(checkoutSha) ||
    releaseSha !== checkoutSha
  ) {
    throw new Error('release SHA does not match checked-out commit');
  }
  return {
    version: packageVersion,
    tag: releaseTag,
    sha: releaseSha,
    channel: version.isPreview ? 'preview' : 'latest',
  };
}

export function captureStableLatest(distTags) {
  const tags = parseDistTags(distTags);
  const latest = tags.latest;
  if (typeof latest !== 'string' || !VERSION_PATTERN.test(latest) || latest.includes('-preview.')) {
    throw new Error('registry latest tag is missing or is not a stable version');
  }
  return latest;
}

export function verifyRegistryReadback({
  version,
  channel,
  integrity,
  actualVersion,
  actualIntegrity,
  distTags,
  stableLatestBefore = null,
}) {
  const parsed = parseVersion(version);
  const expectedChannel = parsed.isPreview ? 'preview' : 'latest';
  if (channel !== expectedChannel) {
    throw new Error('release channel does not match version');
  }
  if (actualVersion !== version) {
    throw new Error('registry version does not match release version');
  }
  if (!INTEGRITY_PATTERN.test(integrity) || actualIntegrity !== integrity) {
    throw new Error('registry integrity does not match packed archive');
  }

  const tags = parseDistTags(distTags);
  if (channel === 'latest') {
    if (tags.latest !== version) throw new Error('stable release was not assigned the latest channel');
    return true;
  }

  if (typeof stableLatestBefore !== 'string' || !VERSION_PATTERN.test(stableLatestBefore) || stableLatestBefore.includes('-preview.')) {
    throw new Error('preview release is missing a valid pre-publish stable latest tag');
  }
  if (tags.preview !== version) throw new Error('preview release was not assigned the preview channel');
  if (tags.latest !== stableLatestBefore) throw new Error('preview release changed the stable latest channel');
  return true;
}

function parseVersion(value) {
  if (typeof value !== 'string') throw new Error('release version is invalid');
  const match = VERSION_PATTERN.exec(value);
  if (!match) throw new Error('release version is not an allowed stable or preview semver');
  return { isPreview: match[4] != null };
}

function parseDistTags(value) {
  let tags = value;
  if (typeof value === 'string') {
    try {
      tags = JSON.parse(value);
    } catch {
      throw new Error('registry dist-tags are invalid JSON');
    }
  }
  if (tags == null || typeof tags !== 'object' || Array.isArray(tags)) {
    throw new Error('registry dist-tags are invalid');
  }
  return tags;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`missing ${name}`);
  return value;
}

function writeOutput(values) {
  for (const [name, value] of Object.entries(values)) {
    if (/[\r\n]/.test(String(value))) throw new Error('release output contains a newline');
    process.stdout.write(`${name}=${value}\n`);
  }
}

function run(command) {
  const mode = command[2];
  if (mode === 'validate') {
    const release = classifyRelease({
      releaseTag: requiredEnv('RELEASE_TAG'),
      packageVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
      releaseRef: requiredEnv('RELEASE_REF'),
      releaseSha: requiredEnv('RELEASE_SHA'),
      checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    });
    writeOutput(release);
    return;
  }
  if (mode === 'capture-stable-latest') {
    writeOutput({ stable_latest: captureStableLatest(requiredEnv('REGISTRY_DIST_TAGS')) });
    return;
  }
  if (mode === 'verify-registry') {
    verifyRegistryReadback({
      version: requiredEnv('RELEASE_VERSION'),
      channel: requiredEnv('RELEASE_CHANNEL'),
      integrity: requiredEnv('EXPECTED_INTEGRITY'),
      actualVersion: requiredEnv('REGISTRY_VERSION'),
      actualIntegrity: requiredEnv('REGISTRY_INTEGRITY'),
      distTags: requiredEnv('REGISTRY_DIST_TAGS'),
      stableLatestBefore: process.env.STABLE_LATEST_BEFORE || null,
    });
    process.stdout.write('Registry release identity verified.\n');
    return;
  }
  throw new Error('usage: release-channel.mjs <validate|capture-stable-latest|verify-registry>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'release validation failed');
    process.exitCode = 1;
  }
}
