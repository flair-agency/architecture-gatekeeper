#!/usr/bin/env node
// Optional local development feedback for the supported self-CI input format.
// This module neither invokes a reviewer nor produces acceptance evidence.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { materializeAuthoritySet, parseAuthorityManifest, readCommittedAuthorityFile } from '../src/authority-set.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { decodeLimits } from '../src/prepare-authority-set.mjs';
import { validateAuthorityReviewSchema } from '../src/preflight-authority-set-review.mjs';
import { assembleReviewContext } from '../src/review-inputs/prepare-review-context.mts';

const REPOSITORY = 'flair-agency/architecture-gatekeeper';
const SELF_WORKFLOW = '.github/workflows/self-architecture-gate.yml';
const CALLED_WORKFLOW = '.github/workflows/architecture-gate.yml';
const SHA = /^[a-f0-9]{40}$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => decoder.decode(bytes);
const reject = reason => { throw new CapacityUnavailable(reason); };
class CapacityUnavailable extends Error {}
class CapacityExceeded extends Error {
  constructor(reason, stage, lowerBoundBytes) {
    super(reason);
    this.stage = stage;
    this.lowerBoundBytes = lowerBoundBytes;
  }
}

// These are preparation-format checks, not a new consumer policy selector.
// The called-workflow fingerprint is updated for pre-checkout immutable-commit
// verification; prompt/task serialization and preparation inputs are
// unchanged, and the assembler already measures the supplied SHA. The exact
// predecessor fingerprints retain the documented pre-merge preview
// path from the older protected base. Other base/runtime drift must be
// explicitly reviewed before this diagnostic can measure it.
const PREVIOUS_CONTEXT_SHA256 = '510b197070f8f12a15567409cf8e92e6da365bbd96e17ef4917cd8c21b38acf0';
const PREVIOUS_CALLED_WORKFLOW_SHA256 = 'ecf6a70d7bffb73f152143dacd5d44a09a57a54c616fa4e3ed94117c89abb046';
const EARLIER_CALLED_WORKFLOW_SHA256 = '3bd669043e677fed4f79d43f8fbe40778aa5b82a4ebd95e50e31d949f00076f2';
const OLDEST_CALLED_WORKFLOW_SHA256 = '65af7366c7cd8493ab836d1bf5a8b259e02d4fad71426e7c16b158693e64eebf';
const FORMAT_FILES = [SELF_WORKFLOW, CALLED_WORKFLOW,
  'src/authority-set.mjs', 'src/resolve-ci-policy.mjs', 'src/prepare-authority-set.mjs',
  'src/preflight-authority-set-review.mjs', 'src/prepare-review-context.mjs',
  'src/authority-validation/authority-set.mts',
  'src/authority-validation/resolve-ci-policy.mts',
  'src/authority-validation/prepare-authority-set.mts',
  'src/authority-validation/preflight-authority-set-review.mts',
  'src/review-inputs/prepare-review-context.mts'];

const CURRENT_FORMAT_SHA256 = {
  ".github/workflows/self-architecture-gate.yml": "b3cd229184f6a90e4edd78ccc15d7a1c527c5c71ac99eb13030298eeba9e6412",
  ".github/workflows/architecture-gate.yml": "237e6a6ba0baebc4a70e8190911bac60044636c2c9d5cf675aa253b5e5095b45",
  "src/authority-set.mjs": "d086de4acf4783b47901c3111760f6659bae111b53d4679261dccd6aa91586fa",
  "src/resolve-ci-policy.mjs": "01243736b030f1776d3de55454c450855324cd42f2c5542b3be5512efbd8aae7",
  "src/prepare-authority-set.mjs": "9141969e86b817f4b68819ee597f505840bf5f85d260bdffd39f61f7a19ce688",
  "src/preflight-authority-set-review.mjs": "f26f35ca6386e1ecfb0e6bfd51b239f8a8e49be3ab8dc1616c6e7b34781ae514",
  "src/prepare-review-context.mjs": "6b5af63dc0fb077482c843ee0937e9c1a26633b593fad9f435f182b97e7051a8",
  "src/authority-validation/authority-set.mts": "4463bace8ba83303a83257acbd36dc05e19cfe3a834b2d4b56eb7206a3c20341",
  "src/authority-validation/resolve-ci-policy.mts": "cdaae106b4ff0e10b39cb5831b32a590ff5c94f32dcccd9c1ccf96064a652ae2",
  "src/authority-validation/prepare-authority-set.mts": "9bce34d75aa8b4d414a089f042616cabb2dd1ac331fcfbe70a43afff304e9dae",
  "src/authority-validation/preflight-authority-set-review.mts": "0d63bd79613598af3d8e4d75bc9bdbbaf7ada600e41ba0b65625c0e1014bc495",
  "src/review-inputs/prepare-review-context.mts": "581b80bf5a5b3c6bce4e0369e5620605a92cef7080f0b82c1e6ae3d76f17ba02"
};

export function supportsPreparationFormatDigest(path, baseDigest, toolDigest) {
  if (toolDigest !== CURRENT_FORMAT_SHA256[path]) return false;
  return baseDigest === toolDigest ||
    (path === CALLED_WORKFLOW && [PREVIOUS_CALLED_WORKFLOW_SHA256, EARLIER_CALLED_WORKFLOW_SHA256, OLDEST_CALLED_WORKFLOW_SHA256].includes(baseDigest)) ||
    (path === 'src/review-inputs/prepare-review-context.mts' && baseDigest === PREVIOUS_CONTEXT_SHA256);
}

function git(root, args, maxBuffer = 256) {
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    encoding: 'buffer', maxBuffer, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveRevision(root, ref) {
  if (typeof ref !== 'string' || !ref || ref.length > 256 || ref.startsWith('-')) reject('invalid-revision');
  const sha = text(git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim();
  if (!SHA.test(sha)) reject('unsupported-revision');
  return sha;
}

function read(root, sha, path, bound) {
  return readCommittedAuthorityFile(root, sha, path, bound);
}

function yaml(bytes) {
  const doc = parseDocument(text(bytes), { uniqueKeys: true });
  if (doc.errors.length) reject('invalid-workflow');
  return doc.toJS({ maxAliasCount: 0 });
}

function pathsForSelfRoute(root, baseSha) {
  const formatDigests = {};
  const contents = {};
  for (const path of FORMAT_FILES) {
    const bytes = read(root, baseSha, path, 262_144);
    const digest = hash(bytes);
    const toolDigest = hash(readFileSync(new URL(`../${path}`, import.meta.url)));
    if (!supportsPreparationFormatDigest(path, digest, toolDigest)) reject('unsupported-preparation-format');
    formatDigests[path] = digest;
    contents[path] = bytes;
  }
  const caller = yaml(contents[SELF_WORKFLOW]);
  const called = yaml(contents[CALLED_WORKFLOW]);
  const job = caller?.jobs?.['architecture-gate'];
  if (job?.uses !== `./${CALLED_WORKFLOW}` || job.with?.['protected-review-instructions'] !== true) {
    reject('unsupported-self-route');
  }
  const selected = {};
  for (const name of ['policy-path', 'prompt-path', 'schema-path', 'validation-path']) {
    const value = job.with?.[name] ?? called?.on?.workflow_call?.inputs?.[name]?.default;
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(value) ||
        value.split('/').some(part => part === '.' || part === '..')) reject('unsupported-input-selection');
    selected[name] = value;
  }
  return { selected, formatDigests };
}

export function capacityState(totalBytes, limitBytes) {
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || !Number.isSafeInteger(limitBytes) || limitBytes < 1) {
    return 'undetermined';
  }
  if (totalBytes > limitBytes) return 'exceeded';
  return totalBytes * 10 >= limitBytes * 9 ? 'approaching-limit' : 'fit';
}

function changedPathLowerBound(stdout, promptBytes) {
  // Only complete records contribute. Their compact JSON array is no larger
  // than the complete, indented changedPaths value in the final context.
  const lastNul = stdout.lastIndexOf(0);
  if (lastNul < 0) return promptBytes.length;
  const paths = [];
  let start = 0;
  try {
    for (let index = 0; index <= lastNul; index += 1) {
      if (stdout[index] === 0) {
        paths.push(new TextDecoder('utf-8', { fatal: true }).decode(stdout.subarray(start, index)));
        start = index + 1;
      }
    }
  } catch { return null; }
  return promptBytes.length + Buffer.byteLength(JSON.stringify(paths), 'utf8');
}

function diffLowerBound(stdout, promptBytes) {
  if (stdout.includes(0)) return null;
  let completeText;
  // Hold back an incomplete final code point without accepting invalid UTF-8.
  try { completeText = new TextDecoder('utf-8', { fatal: true }).decode(stdout, { stream: true }); }
  catch { return null; }
  const escapedPayload = JSON.stringify(completeText).slice(1, -1);
  return promptBytes.length + Buffer.byteLength(escapedPayload, 'utf8');
}

function readBoundedContextGit(root, args, maxBuffer, promptBytes, stage, lowerBoundFor) {
  try { return git(root, args, maxBuffer); }
  catch (error) {
    if (error?.code === 'ENOBUFS' && Buffer.isBuffer(error.stdout) && error.stdout.length > maxBuffer) {
      const lowerBoundBytes = lowerBoundFor(error.stdout, promptBytes);
      if (Number.isSafeInteger(lowerBoundBytes) && lowerBoundBytes > maxBuffer) {
        const reason = stage === 'changed-path-list' ? 'changed-path-list-lower-bound-exceeds-limit' : 'diff-lower-bound-exceeds-limit';
        throw new CapacityExceeded(reason, stage, lowerBoundBytes);
      }
    }
    throw error;
  }
}

// Subsets of JSON-escaped patch payload bytes, not additional prompt components.
// Report only unambiguous simple public paths explicitly opted in by the caller.
function fileContributors(diff, paths) {
  const sections = diff.split(/(?=^diff --git )/m).filter(Boolean);
  if (sections.length !== paths.length) return [];
  const rows = [];
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.startsWith('/') || path.split('/').includes('..') ||
        !sections[index].startsWith(`diff --git a/${path} b/${path}\n`)) continue;
    rows.push({ path, serializedPatchBytes: Buffer.byteLength(JSON.stringify(sections[index]).slice(1, -1)) });
  }
  return rows.sort((a, b) => b.serializedPatchBytes - a.serializedPatchBytes).slice(0, 5);
}

/** Root is the local invoking checkout; its repository label is not authenticated. */
export async function checkReviewCapacity({ root = process.cwd(), base, head, reviewed = 'HEAD', publicPaths = false } = {}) {
  const result = { version: 1, kind: 'review-input-capacity', state: 'undetermined',
    route: 'self-ci-ordinary-codex-authority-set-v1', advisory: { numerator: 9, denominator: 10 },
    scope: null, policy: null, measurement: { exact: false, totalBytes: null, remainingBytes: null },
    reason: null, assurance: 'Local development feedback only; no semantic review or acceptance.' };
  try {
    const checkout = realpathSync(root);
    const baseSha = resolveRevision(checkout, base);
    const headSha = resolveRevision(checkout, head);
    const reviewedSha = resolveRevision(checkout, reviewed);
    result.scope = { repository: REPOSITORY, targetBranch: 'main', baseSha, headSha, reviewedSha,
      snapshot: 'local-committed-merge', repositoryIdentity: 'local-label-only' };
    const parents = text(git(checkout, ['rev-list', '--parents', '-n', '1', reviewedSha])).trim().split(/\s+/);
    if (new Set([baseSha, headSha, reviewedSha]).size !== 3 ||
        resolveRevision(checkout, 'HEAD') !== reviewedSha || parents.length !== 3 ||
        parents[1] !== baseSha || parents[2] !== headSha) reject('invalid-merge-binding');
    const { selected, formatDigests } = pathsForSelfRoute(checkout, baseSha);
    const policyBytes = read(checkout, baseSha, selected['policy-path'], 65_536);
    const policy = resolveCiPolicy(parseCiPolicyJson(text(policyBytes)), 'main');
    if (policy.mode !== 'enforced' || policy.policyVersion !== undefined ||
        (policy.provider !== undefined && policy.provider !== 'codex') ||
        !policy.authorityManifestPath || policy.authorityProfile) reject('unsupported-policy-route');
    const limits = decodeLimits(policy.authorityLimitsBase64, 'v1');
    result.policy = { revision: baseSha, path: selected['policy-path'], sha256: hash(policyBytes),
      baseBranch: 'main', maxPromptBytes: limits.maxPromptBytes, formatDigests };
    const manifestBytes = read(checkout, baseSha, policy.authorityManifestPath, limits.maxManifestBytes);
    const manifest = parseAuthorityManifest(manifestBytes, limits, 'v1');
    if (manifest.authorities.some(member => member.repository !== 'self')) reject('unsupported-external-authority');
    const instructions = read(checkout, baseSha, selected['prompt-path'], limits.maxPromptBytes);
    // The diagnostic's finite schema/validation reads are not selected CI limits.
    const schemaBytes = read(checkout, baseSha, selected['schema-path'], 65_536);
    validateAuthorityReviewSchema(JSON.parse(text(schemaBytes)), 'v1');
    if (selected['validation-path']) JSON.parse(text(read(checkout, baseSha, selected['validation-path'], 65_536)));
    const authority = await materializeAuthoritySet({ manifestBytes, limits, selfRepository: REPOSITORY,
      selfRoot: checkout, authorityRevision: baseSha, profile: 'v1' });
    const authorityBytes = Buffer.from(authority.prompt, 'utf8');
    const promptBytes = Buffer.concat([instructions, authorityBytes]);
    if (promptBytes.length > limits.maxPromptBytes) {
      throw new CapacityExceeded('prepared-prefix-exceeds-limit', 'prepared-prefix', promptBytes.length);
    }
    const pathBytes = readBoundedContextGit(checkout, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff',
      '--no-textconv', '--ignore-submodules=none', baseSha, reviewedSha, '--'], limits.maxPromptBytes,
    promptBytes, 'changed-path-list', changedPathLowerBound);
    if (pathBytes.length && pathBytes.at(-1) !== 0) reject('invalid-changed-paths');
    const changedPathList = [];
    let start = 0;
    for (let index = 0; index < pathBytes.length; index++) {
      if (pathBytes[index] === 0) {
        changedPathList.push(text(pathBytes.subarray(start, index)));
        start = index + 1;
      }
    }
    const diffBytes = readBoundedContextGit(checkout, ['diff', '--text', '--full-index', '--unified=3', '--no-renames',
      '--no-ext-diff', '--no-textconv', '--ignore-submodules=none', baseSha, reviewedSha, '--'], limits.maxPromptBytes,
    promptBytes, 'diff', diffLowerBound);
    if (diffBytes.includes(0)) reject('unsupported-binary-diff');
    const diff = text(diffBytes);
    const assembled = assembleReviewContext({ promptBytes, repository: REPOSITORY, baseSha, headSha,
      reviewedSha, changedPathList, diff });
    result.state = capacityState(assembled.bytes.length, limits.maxPromptBytes);
    result.measurement = { exact: true, totalBytes: assembled.bytes.length,
      remainingBytes: limits.maxPromptBytes - assembled.bytes.length,
      promptSha256: hash(assembled.bytes), manifestSha256: authority.manifestSha256,
      authoritySetDigest: authority.setDigest,
      components: { instructionsBytes: instructions.length, authorityPromptBytes: authorityBytes.length,
        taskContextBytes: assembled.contextBytes },
      changedPathCount: changedPathList.length,
      publicChangedFileContributors: publicPaths ? fileContributors(diff, changedPathList) : [],
      schema: { bytes: schemaBytes.length, sha256: hash(schemaBytes), countedInPromptLimit: false } };
    return result;
  } catch (error) {
    if (error instanceof CapacityExceeded) {
      result.state = 'exceeded';
      result.reason = error.message;
      result.measurement = { exact: false, totalBytes: null, remainingBytes: null,
        lowerBoundBytes: error.lowerBoundBytes, stage: error.stage };
      return result;
    }
    result.reason = error instanceof CapacityUnavailable ? error.message : 'bounded-preparation-incomplete';
    return result;
  }
}

function argumentsFor(args) {
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--public-paths' && values.publicPaths === undefined) values.publicPaths = true;
    else if (['--base', '--head', '--reviewed'].includes(flag) && !Object.hasOwn(values, flag.slice(2))) {
      const value = args[++index];
      if (!value || value.startsWith('--')) reject('invalid-arguments');
      values[flag.slice(2)] = value;
    } else reject('invalid-arguments');
  }
  if (!values.base || !values.head) reject('invalid-arguments');
  return values;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try { result = await checkReviewCapacity(argumentsFor(process.argv.slice(2))); }
  catch { result = { version: 1, kind: 'review-input-capacity', state: 'undetermined', reason: 'invalid-arguments' }; }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.state === 'undetermined' ? 2 : result.state === 'exceeded' ? 1 : 0;
}
