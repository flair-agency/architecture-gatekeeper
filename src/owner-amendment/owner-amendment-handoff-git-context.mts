import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { inspectOwnerAmendmentSelfScope, type OwnerAmendmentSelfScopeResult } from './owner-amendment-scope.mts';
import { parseAuthorityManifest, validateAuthorityLimits } from '../authority-set.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../resolve-ci-policy.mjs';
import type { SynchronousGitCommand, OwnerAmendmentGitChange } from './owner-amendment-git-changes.mts';

type HandoffGitContextInput = Readonly<{
  repository: string;
  baseSha: string;
  headSha: string;
  baseBranch?: string;
  runGit: SynchronousGitCommand;
}>;
type ChangedFile = Readonly<{ path: string; status: 'modified' | 'added' | 'deleted' | 'type-changed' }>;
type AuthorityChangeObservation = Readonly<{ path: string; beforeBytes: Buffer; afterBytes: Buffer }>;
type PolicyView = { mode: unknown; ownerAmendmentVersion: unknown; ownerAmendmentGrade: unknown;
  ownerAmendmentScope: unknown; ownerAmendmentTriggerProfile: unknown; authorityManifestPath: unknown;
  authorityLimitsBase64: unknown; ownerAmendmentAuthorityId: unknown; ownerAmendmentAuthorityPath: unknown;
  authorityProfile?: unknown };
type LimitsView = { maxManifestBytes: number; maxFileBytes: number; maxTotalBytes: number };
type ManifestView = { authorities: { repository: unknown; revision: unknown; path: string; id: string }[] };
export type OwnerAmendmentHandoffGitContext = Readonly<{
  repository: string;
  baseSha: string;
  headSha: string;
  policyPath: string;
  parsedPolicy: Readonly<Record<string, unknown>>;
  policy: Readonly<Record<string, unknown>>;
  manifestPath: string;
  manifest: Readonly<Record<string, unknown>>;
  limits: Readonly<Record<string, unknown>>;
  changedFiles: readonly ChangedFile[];
  scope: OwnerAmendmentSelfScopeResult;
  priorAuthoritySetDigest?: string;
  resultingAuthoritySetDigest?: string;
  readonly policyBytes: Buffer;
  readonly manifestBytes: Buffer;
  readonly authorityBytes: Readonly<{ base: Buffer; head: Buffer }>;
  readonly authorityChanges?: readonly OwnerAmendmentGitChange[];
}>;

const SHA = /^[a-f0-9]{40}$/;
const POLICY_PATH = '.codex/gatekeeper/ci-policy.json';
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_POLICY_BYTES = 65_536;

function fail(message: string): never { throw new Error(`Owner amendment Git context: ${message}`); }

function git(runGit: SynchronousGitCommand, args: string[], maxBytes = 1_048_576): Buffer {
  let result: Buffer;
  // A local refs/replace entry must never redefine the protected object's
  // contents while the returned context still names its original SHA.
  try { result = runGit(['--no-replace-objects', ...args]); } catch { fail(`git operation failed: ${args[0]}.`); }
  if (!Buffer.isBuffer(result) || result.length > maxBytes) fail(`git returned malformed or oversized output for ${args[0]}.`);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function text(bytes: Buffer, label: string): string {
  try { return decoder.decode(bytes); } catch { fail(`${label} is not valid UTF-8.`); }
}

function commit(runGit: SynchronousGitCommand, sha: string): void {
  const kind = text(git(runGit, ['cat-file', '-t', sha], 128), 'commit object type').trim();
  if (kind !== 'commit') fail(`${sha} is not a commit object.`);
}

function readRegularBlob(runGit: SynchronousGitCommand, revision: string, path: string, maxBytes: number): Buffer {
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

function changedFiles(runGit: SynchronousGitCommand, baseSha: string, headSha: string): ChangedFile[] {
  const output = git(runGit, ['diff', '--name-status', '-z', '--no-renames', baseSha, headSha], 1_048_576);
  if (!output.length || output[output.length - 1] !== 0) fail('change list is empty or malformed.');
  const fields = text(output.subarray(0, -1), 'change list').split('\0');
  if (fields.length % 2 !== 0 || fields.some(field => !field)) fail('change list has malformed name-status fields.');
  const statuses = new Map<string, ChangedFile['status']>([['M', 'modified'], ['A', 'added'], ['D', 'deleted'], ['T', 'type-changed']]);
  const result: ChangedFile[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const status = statuses.get(fields[i]);
    if (!status || fields[i].length !== 1) fail('change list contains an unsupported diff status.');
    result.push({ path: fields[i + 1], status });
  }
  return result;
}

function decodeLimits(encoded: unknown, profile: unknown): unknown {
  if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    fail('protected authority limits are malformed.');
  }
  let limits: unknown;
  try { limits = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { fail('protected authority limits are malformed.'); }
  try { return validateAuthorityLimits(limits, profile as string); }
  catch { fail('protected authority limits are invalid.'); }
}

/**
 * Resolve all handoff inputs from exact Git objects. `runGit` must execute its
 * argument array (including Git's --no-replace-objects global option) against
 * a checkout containing both commits and return raw stdout bytes. This prepares
 * eligibility inputs only; it does not accept B or create/read a tag.
 */
export function resolveOwnerAmendmentHandoffGitContext({ repository, baseSha, headSha, baseBranch = 'main', runGit }: HandoffGitContextInput): OwnerAmendmentHandoffGitContext {
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
  let parsedPolicy: unknown;
  try { parsedPolicy = parseCiPolicyJson(text(policyBytes, 'protected CI policy')); }
  catch { fail('previous-base CI policy is invalid.'); }
  let policy: unknown;
  try { policy = resolveCiPolicy(parsedPolicy, baseBranch); }
  catch { fail('previous-base policy cannot be resolved.'); }
  if (baseBranch !== 'main') fail('v0.6.0 self amendment profile supports only protected main.');
  // Access view for fields established by the existing policy parser/resolver checks.
  if ((policy as PolicyView).mode !== 'enforced' || (policy as PolicyView).ownerAmendmentVersion !== 1 ||
      (policy as PolicyView).ownerAmendmentGrade !== 'G0' || (policy as PolicyView).ownerAmendmentScope !== 'authority-only' ||
      !['completed-block-v1', 'completed-owner-decision-self-v1'].includes((policy as PolicyView).ownerAmendmentTriggerProfile as string) ||
      !(policy as PolicyView).authorityManifestPath || !(policy as PolicyView).authorityLimitsBase64 ||
      !(policy as PolicyView).ownerAmendmentAuthorityId || !(policy as PolicyView).ownerAmendmentAuthorityPath) {
    fail('previous protected main policy does not select a supported self G0 amendment trigger profile.');
  }

  const profile = (policy as PolicyView).authorityProfile ?? 'v1';
  const limits = decodeLimits((policy as PolicyView).authorityLimitsBase64, profile);
  // Access view for the already-validated protected size limits.
  const manifestBytes = readRegularBlob(runGit, baseSha, (policy as PolicyView).authorityManifestPath as string,
    (limits as LimitsView).maxManifestBytes);
  let manifest: unknown;
  try { manifest = parseAuthorityManifest(manifestBytes, limits, profile as string); }
  catch { fail('previous-base Authority Set manifest is invalid.'); }
  const path = (policy as PolicyView).ownerAmendmentAuthorityPath as string;
  const authorityByteLimit = Math.min((limits as LimitsView).maxFileBytes, (limits as LimitsView).maxTotalBytes);
  const baseAuthorityBytes = readRegularBlob(runGit, baseSha, path, authorityByteLimit);
  const headAuthorityBytes = readRegularBlob(runGit, headSha, path, authorityByteLimit);
  const files = changedFiles(runGit, baseSha, headSha);
  let scope: OwnerAmendmentSelfScopeResult;
  try { scope = inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha,
    changedFiles: files, baseAuthorityBytes, headAuthorityBytes }); }
  catch { fail('exact B does not satisfy the previous-base self authority-only scope.'); }

  let authorityChanges: AuthorityChangeObservation[] | undefined;
  let priorAuthoritySetDigest: string | undefined;
  let resultingAuthoritySetDigest: string | undefined;
  if ((policy as PolicyView).ownerAmendmentTriggerProfile === 'completed-owner-decision-self-v1') {
    const members: { beforeBytes: Buffer; afterBytes: Buffer; descriptor: (bytes: Buffer) => object }[] = [];
    const changesByPath = new Map<string, AuthorityChangeObservation>();
    let previousTotal = 0;
    let resultingTotal = 0;
    for (const member of (manifest as ManifestView).authorities) {
      if (member.repository !== 'self' || member.revision !== 'authority-revision') {
        fail('OWNER_DECISION profile requires every previous Authority Set member to be a self authority.');
      }
      const beforeBytes = readRegularBlob(runGit, baseSha, member.path, (limits as LimitsView).maxFileBytes);
      const changed = files.find(file => file.path === member.path);
      const afterBytes = readRegularBlob(runGit, headSha, member.path, (limits as LimitsView).maxFileBytes);
      if (changed && beforeBytes.equals(afterBytes)) {
        fail(`changed OWNER_DECISION Authority Set member ${member.path} has no before/after byte change.`);
      }
      if (!changed && !beforeBytes.equals(afterBytes)) {
        fail('unreported OWNER_DECISION Authority Set member change differs between base and B.');
      }
      previousTotal += beforeBytes.length;
      resultingTotal += afterBytes.length;
      if (previousTotal > (limits as LimitsView).maxTotalBytes || resultingTotal > (limits as LimitsView).maxTotalBytes) {
        fail('previous or resulting complete Authority Set exceeds its protected total byte limit.');
      }
      members.push({ beforeBytes, afterBytes, descriptor: bytes => ({ id: member.id, repository,
        resolvedCommit: baseSha, path: member.path, byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') }) });
      if (changed) changesByPath.set(member.path, { path: member.path,
        beforeBytes: Buffer.from(beforeBytes), afterBytes: Buffer.from(afterBytes) });
    }
    const expectedChangedPaths = files.map(file => file.path).sort();
    const authorityChangedPaths = [...changesByPath.keys()].sort();
    if (expectedChangedPaths.length !== authorityChangedPaths.length ||
        expectedChangedPaths.some((changedPath, index) => changedPath !== authorityChangedPaths[index])) {
      fail('OWNER_DECISION changed paths do not exactly match previous self Authority Set members.');
    }
    authorityChanges = authorityChangedPaths.map(changedPath => changesByPath.get(changedPath)!);
    const previousDescriptors = members.map(member => member.descriptor(member.beforeBytes));
    const resultingDescriptors = members.map(member => member.descriptor(member.afterBytes));
    priorAuthoritySetDigest = createHash('sha256').update(JSON.stringify(previousDescriptors), 'utf8').digest('hex');
    resultingAuthoritySetDigest = createHash('sha256').update(JSON.stringify(resultingDescriptors), 'utf8').digest('hex');
  }

  const immutable = { repository, baseSha, headSha, policyPath: POLICY_PATH,
    parsedPolicy: deepFreeze(parsedPolicy as Record<string, unknown>), policy: deepFreeze(policy as Record<string, unknown>),
    manifestPath: (policy as PolicyView).authorityManifestPath as string, manifest: deepFreeze(manifest as Record<string, unknown>),
    limits: deepFreeze(limits as Record<string, unknown>), changedFiles: deepFreeze(files), scope,
    ...(authorityChanges ? { priorAuthoritySetDigest, resultingAuthoritySetDigest } : {}) };
  Object.defineProperties(immutable, {
    policyBytes: { enumerable: true, get: () => Buffer.from(policyBytes) },
    manifestBytes: { enumerable: true, get: () => Buffer.from(manifestBytes) },
    authorityBytes: { enumerable: true, get: () => Object.freeze({
      base: Buffer.from(baseAuthorityBytes), head: Buffer.from(headAuthorityBytes),
    }) },
    ...(authorityChanges ? { authorityChanges: { enumerable: true, get: () => Object.freeze(authorityChanges.map(change => Object.freeze({
      path: change.path, beforeBytes: Buffer.from(change.beforeBytes), afterBytes: Buffer.from(change.afterBytes),
    }))) } } : {})
  });
  // Object.defineProperties adds the existing copied-byte getters; completed parser checks and deepFreeze establish these JSON observations.
  return Object.freeze(immutable) as unknown as OwnerAmendmentHandoffGitContext;
}
