import { createHash } from 'node:crypto';
import { validateRepositoryTreePath } from '../runner-temp-path.mjs';

export type OwnerAmendmentGitChange = Readonly<{ path: unknown; beforeBytes: Buffer; afterBytes: Buffer }>;
export type OwnerAmendmentGitChangesResult = Readonly<{
  changes: readonly OwnerAmendmentGitChange[];
  diffBytes: Buffer;
}>;
export type OwnerAmendmentAuthorityDescriptor = Readonly<{
  id: string;
  repository: string;
  resolvedCommit: string;
  path: string;
  byteLength: number;
  sha256: string;
}>;
export type OwnerAmendmentResultingAuthoritySet = Readonly<{
  priorDigest: string;
  resultingDigest: string;
  descriptors: readonly OwnerAmendmentAuthorityDescriptor[];
}>;
export type OwnerAmendmentGitProfile = 'completed-block-v1' | 'completed-owner-decision-self-v1';
export type SynchronousGitCommand = (args: string[]) => Buffer;
export type SynchronousGitBlobReader = (revision: string, path: string) => Buffer;
type DeriveOwnerAmendmentGitChangesCommonInput = Readonly<{
  repository: string;
  baseSha: string;
  bSha: string;
  targetPath: string;
  selectedAuthorityBytes: unknown;
  runGit: SynchronousGitCommand;
  readBlob: SynchronousGitBlobReader;
}>;
export type DeriveOwnerAmendmentGitChangesInput = DeriveOwnerAmendmentGitChangesCommonInput & (
  | Readonly<{ profile: 'completed-block-v1'; changedFiles?: unknown; authorityChanges?: unknown }>
  | Readonly<{ profile: 'completed-owner-decision-self-v1'; changedFiles: unknown; authorityChanges: unknown }>
);
export type OwnerAmendmentAuthorityMemberInput = Readonly<{
  id: string;
  repository: string;
  resolvedCommit: string;
  path: string;
  byteLength: number;
  sha256: string;
  content: unknown;
}>;
export type ComputeOwnerAmendmentResultingAuthoritySetInput = Readonly<{
  members: readonly OwnerAmendmentAuthorityMemberInput[];
  changes: readonly OwnerAmendmentGitChange[];
  repository: string;
  baseSha: string;
  expectedPriorDigest?: unknown;
  expectedResultingDigest?: unknown;
}>;

const PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
const MAX_CHANGES = 32;
const MAX_DIFF_BYTES = 1_048_576;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fail: (message: string) => never = message => { throw new Error(`Owner amendment Git changes: ${message}`); };
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function parseNameStatus(bytes: unknown): string[] {
  if (!Buffer.isBuffer(bytes)) fail('Git changed-path listing is missing.');
  const values = bytes.toString('utf8').split('\0');
  if (values.at(-1) !== '') fail('Git changed-path listing is truncated.');
  values.pop();
  if (values.length % 2 !== 0) fail('Git changed-path listing is malformed.');
  const paths: string[] = [];
  for (let index = 0; index < values.length; index += 2) {
    if (values[index] !== 'M') fail('B changes a non-modified path or contains a rename.');
    paths.push(validateRepositoryTreePath(values[index + 1]));
  }
  if (paths.length < 1 || paths.length > MAX_CHANGES || new Set(paths).size !== paths.length ||
      paths.some((path, index) => index > 0 && lexical(paths[index - 1], path) >= 0)) {
    fail('Git modified-path set is empty, duplicated, oversized or not in exact path order.');
  }
  return paths;
}

type ChangedFileView = { path: unknown; status: unknown };
type AuthorityChangeView = { path: unknown; beforeBytes: unknown; afterBytes: unknown };
type SelectedAuthorityBytesView = { base?: unknown; head?: unknown };
function validateContextLists({ profile, changedFiles, authorityChanges, actualPaths, targetPath }: {
  profile: unknown; changedFiles: unknown; authorityChanges: unknown; actualPaths: string[]; targetPath: string;
}): void {
  if (profile === 'completed-block-v1') {
    if (actualPaths.length !== 1 || actualPaths[0] !== targetPath) fail('completed BLOCK must retain its one-target change scope.');
    return;
  }
  if (!Array.isArray(changedFiles) || changedFiles.length !== actualPaths.length ||
      changedFiles.some((file: unknown, index: number) => !file || (file as ChangedFileView).status !== 'modified' || (file as ChangedFileView).path !== actualPaths[index])) {
    fail('protected changedFiles does not exactly match the complete modified Git path set.');
  }
  if (!Array.isArray(authorityChanges) || authorityChanges.length !== actualPaths.length ||
      authorityChanges.some((change: unknown, index: number) => !change || Object.keys(change as object).length !== 3 ||
        !Object.hasOwn(change as object, 'path') || !Object.hasOwn(change as object, 'beforeBytes') || !Object.hasOwn(change as object, 'afterBytes') ||
        (change as AuthorityChangeView).path !== actualPaths[index])) {
    fail('protected authorityChanges does not exactly match the complete modified Git path set.');
  }
  if (!actualPaths.includes(targetPath)) fail('OWNER_DECISION changes omit the selected target authority.');
}

/** Re-read every protected B authority blob and the full unfiltered base-to-B diff. */
export function deriveOwnerAmendmentGitChanges(input: DeriveOwnerAmendmentGitChangesInput): OwnerAmendmentGitChangesResult;
// Keep the historical runtime default; the assertion is erased and the public overload still requires complete inputs.
export function deriveOwnerAmendmentGitChanges({ profile, repository, baseSha, bSha, targetPath,
  selectedAuthorityBytes, changedFiles, authorityChanges, runGit, readBlob }: DeriveOwnerAmendmentGitChangesInput = {} as DeriveOwnerAmendmentGitChangesInput): OwnerAmendmentGitChangesResult {
  if (!PROFILES.has(profile) || typeof repository !== 'string' || !/^[a-f0-9]{40}$/.test(baseSha ?? '') ||
      !/^[a-f0-9]{40}$/.test(bSha ?? '') || baseSha === bSha || typeof runGit !== 'function' ||
      typeof readBlob !== 'function') fail('trusted profile, repository, revisions and Git adapters are required.');
  validateRepositoryTreePath(targetPath);
  const actualPaths = parseNameStatus(runGit(['--no-replace-objects', 'diff', '--name-status', '-z', '--no-renames', baseSha, bSha]));
  validateContextLists({ profile, changedFiles, authorityChanges, actualPaths, targetPath });
  const sourceChanges: unknown[] = profile === 'completed-block-v1'
    ? [{ path: targetPath, beforeBytes: (selectedAuthorityBytes as SelectedAuthorityBytesView | null)?.base,
      afterBytes: (selectedAuthorityBytes as SelectedAuthorityBytesView | null)?.head }]
    : authorityChanges as unknown[];
  const changes = sourceChanges.map((change: unknown): OwnerAmendmentGitChange => {
    validateRepositoryTreePath((change as AuthorityChangeView).path as string);
    const beforeBytes = readBlob(baseSha as string, (change as AuthorityChangeView).path as string);
    const afterBytes = readBlob(bSha as string, (change as AuthorityChangeView).path as string);
    if (!Buffer.isBuffer(beforeBytes) || !Buffer.isBuffer(afterBytes) || !beforeBytes.length || !afterBytes.length ||
        beforeBytes.equals(afterBytes) || !beforeBytes.equals((change as AuthorityChangeView).beforeBytes as Uint8Array) ||
        !afterBytes.equals((change as AuthorityChangeView).afterBytes as Uint8Array)) {
      fail(`protected Git bytes differ from authority change ${(change as AuthorityChangeView).path}.`);
    }
    if ((change as AuthorityChangeView).path === targetPath && (!((selectedAuthorityBytes as SelectedAuthorityBytesView | null)?.base as Buffer | undefined)?.equals(beforeBytes) ||
        !((selectedAuthorityBytes as SelectedAuthorityBytesView | null)?.head as Buffer | undefined)?.equals(afterBytes))) fail('selected target compatibility bytes differ from the exact Git change.');
    return Object.freeze({ path: (change as AuthorityChangeView).path, beforeBytes, afterBytes });
  });
  const diffBytes = runGit(['--no-replace-objects', 'diff', '--binary', '--no-ext-diff', '--no-renames', baseSha as string, bSha as string]);
  if (!Buffer.isBuffer(diffBytes) || !diffBytes.length || diffBytes.length > MAX_DIFF_BYTES) {
    fail('complete unfiltered base-to-B diff is missing or oversized.');
  }
  return Object.freeze({ changes: Object.freeze(changes), diffBytes });
}

/** Rebind all changed self members while preserving the manifest's descriptor order. */
export function computeOwnerAmendmentResultingAuthoritySet(input: ComputeOwnerAmendmentResultingAuthoritySetInput): OwnerAmendmentResultingAuthoritySet;
// Keep the historical runtime default; this erased assertion does not loosen the public overload.
export function computeOwnerAmendmentResultingAuthoritySet({ members, changes, repository, baseSha,
  expectedPriorDigest, expectedResultingDigest }: ComputeOwnerAmendmentResultingAuthoritySetInput = {} as ComputeOwnerAmendmentResultingAuthoritySetInput): OwnerAmendmentResultingAuthoritySet {
  if (!Array.isArray(members) || !members.length || !Array.isArray(changes) || !changes.length ||
      typeof repository !== 'string' || !/^[a-f0-9]{40}$/.test((baseSha ?? '') as string)) {
    fail('complete previous Authority Set and exact changes are required.');
  }
  const descriptors = members.map((member: OwnerAmendmentAuthorityMemberInput): OwnerAmendmentAuthorityDescriptor => {
    if (!member || typeof member !== 'object' || typeof member.id !== 'string' ||
        typeof member.repository !== 'string' || typeof member.resolvedCommit !== 'string' ||
        typeof member.path !== 'string' || !Number.isSafeInteger(member.byteLength) ||
        !/^[a-f0-9]{64}$/.test((member.sha256 ?? '') as string)) fail('materialized Authority Set member is malformed.');
    const bytes = Buffer.isBuffer(member.content) ? member.content : Buffer.from((member.content ?? '') as string, 'utf8');
    if (!bytes.length || bytes.length !== member.byteLength || hash(bytes) !== member.sha256) {
      fail(`materialized Authority Set bytes differ from descriptor ${member.id}.`);
    }
    return { id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: member.byteLength, sha256: member.sha256 };
  });
  const priorDigest = hash(Buffer.from(JSON.stringify(descriptors), 'utf8'));
  if (expectedPriorDigest !== undefined && expectedPriorDigest !== priorDigest) {
    fail('protected previous Authority Set digest differs from materialized descriptors.');
  }
  const seen = new Set<unknown>();
  for (const change of changes) {
    validateRepositoryTreePath(change.path as string);
    if (seen.has(change.path)) fail('authority change paths are duplicated.');
    seen.add(change.path);
    const matches = descriptors.map((member, index) => ({ member, index })).filter(({ member }) =>
      member.path === change.path && member.repository.toLowerCase() === repository.toLowerCase() && member.resolvedCommit === baseSha);
    if (matches.length !== 1) fail(`changed path ${change.path} does not identify exactly one previous self Authority Set member.`);
    const { index } = matches[0];
    descriptors[index] = { ...descriptors[index], byteLength: change.afterBytes.length, sha256: hash(change.afterBytes) };
  }
  const resultingDigest = hash(Buffer.from(JSON.stringify(descriptors), 'utf8'));
  if (expectedResultingDigest !== undefined && expectedResultingDigest !== resultingDigest) {
    fail('protected resulting Authority Set digest differs from all exact changed self members.');
  }
  return Object.freeze({ priorDigest, resultingDigest, descriptors: Object.freeze(descriptors.map(Object.freeze) as OwnerAmendmentAuthorityDescriptor[]) });
}
