import { TextDecoder } from 'node:util';
import { inspectOwnerAmendmentSelfScope } from './owner-amendment-scope.mjs';
import { parseAuthorityManifest, validateAuthorityLimits } from './authority-set.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from './resolve-ci-policy.mjs';

const SHA = /^[a-f0-9]{40}$/;
const POLICY_PATH = '.codex/gatekeeper/ci-policy.json';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_POLICY_BYTES = 65_536;

function fail(message) { throw new Error(`Owner amendment Git context: ${message}`); }

function git(runGit, args, maxBytes = 1_048_576) {
  let result;
  // A local refs/replace entry must never redefine the protected object's
  // contents while the returned context still names its original SHA.
  try { result = runGit(['--no-replace-objects', ...args]); } catch { fail(`git operation failed: ${args[0]}.`); }
  if (!Buffer.isBuffer(result) || result.length > maxBytes) fail(`git returned malformed or oversized output for ${args[0]}.`);
  return result;
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function text(bytes, label) {
  try { return decoder.decode(bytes); } catch { fail(`${label} is not valid UTF-8.`); }
}

function commit(runGit, sha) {
  const kind = text(git(runGit, ['cat-file', '-t', sha], 128), 'commit object type').trim();
  if (kind !== 'commit') fail(`${sha} is not a commit object.`);
}

function readRegularBlob(runGit, revision, path, maxBytes) {
  const output = git(runGit, ['ls-tree', '-z', '--full-tree', revision, '--', path], 16_384);
  if (!output.length || output[output.length - 1] !== 0) fail(`tree entry for ${path} is missing or malformed.`);
  const records = text(output.subarray(0, -1), 'tree entry list').split('\0');
  if (records.length !== 1) fail(`tree entry for ${path} is ambiguous.`);
  const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(records[0]);
  if (!match || match[3] !== path) fail(`${path} is not a regular-file blob.`);
  const sizeBytes = git(runGit, ['cat-file', '-s', match[2]], 128);
  if (!/^\d+\n?$/.test(sizeBytes.toString('ascii'))) fail(`blob size for ${path} is malformed.`);
  const size = Number(sizeBytes.toString('ascii').trim());
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) fail(`${path} exceeds its protected size limit.`);
  const content = git(runGit, ['cat-file', 'blob', match[2]], maxBytes + 1);
  if (content.length !== size) fail(`${path} changed while being read.`);
  return Buffer.from(content);
}

function changedFiles(runGit, baseSha, headSha) {
  const output = git(runGit, ['diff', '--name-status', '-z', '--no-renames', baseSha, headSha], 1_048_576);
  if (!output.length || output[output.length - 1] !== 0) fail('change list is empty or malformed.');
  const fields = text(output.subarray(0, -1), 'change list').split('\0');
  if (fields.length % 2 !== 0 || fields.some(field => !field)) fail('change list has malformed name-status fields.');
  const statuses = new Map([['M', 'modified'], ['A', 'added'], ['D', 'deleted'], ['T', 'type-changed']]);
  const result = [];
  for (let i = 0; i < fields.length; i += 2) {
    const status = statuses.get(fields[i]);
    if (!status || fields[i].length !== 1) fail('change list contains an unsupported diff status.');
    result.push({ path: fields[i + 1], status });
  }
  return result;
}

function decodeLimits(encoded, profile) {
  if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    fail('protected authority limits are malformed.');
  }
  let limits;
  try { limits = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { fail('protected authority limits are malformed.'); }
  try { return validateAuthorityLimits(limits, profile); }
  catch { fail('protected authority limits are invalid.'); }
}

/**
 * Resolve all handoff inputs from exact Git objects. `runGit` must execute its
 * argument array (including Git's --no-replace-objects global option) against
 * a checkout containing both commits and return raw
 * stdout bytes. This prepares eligibility inputs only; it does not accept B or
 * create/read a tag.
 */
export function resolveOwnerAmendmentHandoffGitContext({ repository, baseSha, headSha, baseBranch = 'main', runGit }) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository) || repository.includes('..')) {
    fail('a canonical owner/repository identity is required.');
  }
  if (!SHA.test(baseSha ?? '') || !SHA.test(headSha ?? '') || baseSha === headSha || typeof runGit !== 'function') {
    fail('exact base and B commit SHAs plus a Git reader are required.');
  }
  commit(runGit, baseSha);
  commit(runGit, headSha);
  const mergeBase = text(git(runGit, ['merge-base', baseSha, headSha], 128), 'merge base').trim();
  if (mergeBase !== baseSha) fail('the selected base is not an ancestor of B.');

  const policyBytes = readRegularBlob(runGit, baseSha, POLICY_PATH, MAX_POLICY_BYTES);
  let parsedPolicy;
  try { parsedPolicy = parseCiPolicyJson(text(policyBytes, 'protected CI policy')); }
  catch { fail('previous-base CI policy is invalid.'); }
  let policy;
  try { policy = resolveCiPolicy(parsedPolicy, baseBranch); }
  catch { fail('previous-base policy cannot be resolved.'); }
  if (baseBranch !== 'main') fail('v0.6.0 self amendment profile supports only protected main.');
  if (policy.mode !== 'enforced' || policy.ownerAmendmentVersion !== 1 || policy.ownerAmendmentGrade !== 'G0' ||
      policy.ownerAmendmentScope !== 'authority-only' ||
      !['completed-block-v1', 'completed-owner-decision-self-v1'].includes(policy.ownerAmendmentTriggerProfile) ||
      !policy.authorityManifestPath || !policy.authorityLimitsBase64 || !policy.ownerAmendmentAuthorityId || !policy.ownerAmendmentAuthorityPath) {
    fail('previous protected main policy does not select a supported self G0 amendment trigger profile.');
  }

  const profile = policy.authorityProfile ?? 'v1';
  const limits = decodeLimits(policy.authorityLimitsBase64, profile);
  const manifestBytes = readRegularBlob(runGit, baseSha, policy.authorityManifestPath, limits.maxManifestBytes);
  let manifest;
  try { manifest = parseAuthorityManifest(manifestBytes, limits, profile); }
  catch { fail('previous-base Authority Set manifest is invalid.'); }
  const path = policy.ownerAmendmentAuthorityPath;
  const authorityByteLimit = Math.min(limits.maxFileBytes, limits.maxTotalBytes);
  const baseAuthorityBytes = readRegularBlob(runGit, baseSha, path, authorityByteLimit);
  const headAuthorityBytes = readRegularBlob(runGit, headSha, path, authorityByteLimit);
  const files = changedFiles(runGit, baseSha, headSha);
  let scope;
  try { scope = inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha,
    changedFiles: files, baseAuthorityBytes, headAuthorityBytes }); }
  catch { fail('exact B does not satisfy the previous-base self authority-only scope.'); }

  const immutable = { repository, baseSha, headSha, policyPath: POLICY_PATH,
    parsedPolicy: deepFreeze(parsedPolicy), policy: deepFreeze(policy),
    manifestPath: policy.authorityManifestPath, manifest: deepFreeze(manifest),
    limits: deepFreeze(limits), changedFiles: deepFreeze(files), scope };
  Object.defineProperties(immutable, {
    policyBytes: { enumerable: true, get: () => Buffer.from(policyBytes) },
    manifestBytes: { enumerable: true, get: () => Buffer.from(manifestBytes) },
    authorityBytes: { enumerable: true, get: () => Object.freeze({
      base: Buffer.from(baseAuthorityBytes), head: Buffer.from(headAuthorityBytes),
    }) },
  });
  return Object.freeze(immutable);
}
