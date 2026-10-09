import { createHash } from 'node:crypto';

export type GitHubOwnerAdditionReadbackInput = Readonly<{
  repository: unknown; expected: unknown; pullRequest: unknown; mergeCommit: unknown;
  targetRef: unknown; targetCommit: unknown;
}>;

export type GitHubOwnerAdditionReadbackResult = Readonly<{
  merge: Readonly<{
    hostMetadata: Readonly<{
      status: 'verified'; repository: string; targetBranch: unknown; pullRequestNumber: unknown;
      headSha: unknown; baseSha: unknown; state: 'merged'; mergeSha: unknown; mergedAt: string;
    }>;
    commit: Readonly<{ sha: unknown; parents: readonly unknown[]; tree: unknown }>;
  }>;
  targetReadback: Readonly<{
    status: 'verified'; repository: string; targetRef: string; targetSha: unknown;
    ancestorShas: readonly unknown[]; authorityDigest: string;
  }>;
}>;

// These erased views only describe the original property reads after the
// existing object-shape guards. They do not make external values trusted.
type InputView = { repository?: unknown; expected?: unknown; pullRequest?: unknown;
  mergeCommit?: unknown; targetRef?: unknown; targetCommit?: unknown };
type ExpectedView = { [key: string]: unknown; targetBranch?: unknown; pullRequestNumber?: unknown; baseSha?: unknown;
  bSha?: unknown; bTree?: unknown; authorityPath?: unknown; authorityDigest?: unknown };
type PullRequestView = { number?: unknown; state?: unknown; merged?: unknown; base?: { ref?: unknown;
  repo?: { full_name?: { toLowerCase: () => string } | null } }; head?: { sha?: unknown };
  merge_commit_sha?: unknown; merged_at?: unknown };
type MergeCommitView = { sha?: unknown; tree?: unknown; parents?: unknown[] };
type TargetRefView = { ref?: unknown; sha?: unknown };
type TargetCommitView = { sha?: unknown; ancestorShas?: unknown[]; authoritySnapshot?: unknown };
type AuthoritySnapshotView = { commitSha?: unknown; path?: unknown; bytes?: unknown };

const OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256 = /^[a-f0-9]{64}$/;

function requireObject(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function requireObjectId(value: unknown, label: string) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new TypeError(`${label} is not a Git object ID.`);
  }
}

function requireDigest(value: unknown, label: string) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new TypeError(`${label} is not a SHA-256 digest.`);
  }
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Verify the post-merge GitHub/Git facts needed by the v0.5.1
 * OWNER_ADDITION adoption evaluator. The caller must obtain pullRequest from
 * the GitHub REST API and all commit/ref/ancestry/authority bytes from a fresh
 * read of the named repository; this function does not perform network I/O.
 * In particular, targetRef must come from a fresh GitHub refs API read, and
 * targetCommit.authoritySnapshot must be populated from the exact target
 * commit (for example, `git show <targetSha>:<authorityPath>`).
 *
 * The GitHub PR base SHA is intentionally not used as the recorded base: it
 * may move after the merge. The exact recorded base is proven as first parent
 * of the merge commit, while the PR metadata binds the PR, target branch, B,
 * merge state, merge timestamp and merge commit SHA.
 */
export function verifyOwnerAdditionReadback(input: unknown): GitHubOwnerAdditionReadbackResult {
  requireObject(input, 'Readback input');
  const { repository, expected, pullRequest, mergeCommit, targetRef, targetCommit } = input as InputView;
  requireObject(expected, 'Expected candidate');
  requireObject(pullRequest, 'GitHub pull request metadata');
  requireObject(mergeCommit, 'Git merge commit');
  requireObject(targetRef, 'Target ref');
  requireObject(targetCommit, 'Target commit');


  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new TypeError('Repository must be an owner/name identity.');
  }
  if (typeof (expected as ExpectedView).targetBranch !== 'string' || !(expected as ExpectedView).targetBranch ||
      ((expected as ExpectedView).targetBranch as string).startsWith('refs/') || ((expected as ExpectedView).targetBranch as string).includes('..')) {
    throw new TypeError('Expected target branch is invalid.');
  }
  if (!Number.isSafeInteger((expected as ExpectedView).pullRequestNumber) || ((expected as ExpectedView).pullRequestNumber as number) < 1) {
    throw new TypeError('Expected pull request number is invalid.');
  }
  for (const key of ['baseSha', 'bSha', 'bTree']) requireObjectId((expected as ExpectedView)[key], `Expected ${key}`);
  if (typeof (expected as ExpectedView).authorityPath !== 'string' || !(expected as ExpectedView).authorityPath ||
      ((expected as ExpectedView).authorityPath as string).startsWith('/') || ((expected as ExpectedView).authorityPath as string).split('/').includes('..')) {
    throw new TypeError('Expected authority path is invalid.');
  }
  requireDigest((expected as ExpectedView).authorityDigest, 'Expected authority digest');

  if ((pullRequest as PullRequestView).number !== (expected as ExpectedView).pullRequestNumber ||
      (pullRequest as PullRequestView).state !== 'closed' || (pullRequest as PullRequestView).merged !== true) {
    throw new Error('GitHub metadata does not identify the expected merged pull request.');
  }
  if ((pullRequest as PullRequestView).base?.ref !== (expected as ExpectedView).targetBranch ||
      (pullRequest as PullRequestView).base?.repo?.full_name?.toLowerCase() !== repository.toLowerCase()) {
    throw new Error('GitHub pull request metadata does not bind the expected repository and target branch.');
  }
  if ((pullRequest as PullRequestView).head?.sha !== (expected as ExpectedView).bSha) {
    throw new Error('Merged pull request head differs from exact B.');
  }
  requireObjectId((pullRequest as PullRequestView).merge_commit_sha, 'GitHub merge commit SHA');
  if (typeof (pullRequest as PullRequestView).merged_at !== 'string' || !Number.isFinite(Date.parse((pullRequest as PullRequestView).merged_at as string))) {
    throw new Error('GitHub merged timestamp is missing or invalid.');
  }

  requireObjectId((mergeCommit as MergeCommitView).sha, 'Merge commit SHA');
  requireObjectId((mergeCommit as MergeCommitView).tree, 'Merge commit tree');
  if ((pullRequest as PullRequestView).merge_commit_sha !== (mergeCommit as MergeCommitView).sha) {
    throw new Error('GitHub merge SHA differs from the read merge commit.');
  }
  if (!Array.isArray((mergeCommit as MergeCommitView).parents) || ((mergeCommit as MergeCommitView).parents as unknown[]).length !== 2) {
    throw new Error('Only an ordinary two-parent merge commit is supported.');
  }
  ((mergeCommit as MergeCommitView).parents as unknown[]).forEach((parent, index) => requireObjectId(parent, `Merge parent ${index + 1}`));
  if (((mergeCommit as MergeCommitView).parents as unknown[])[0] !== (expected as ExpectedView).baseSha || ((mergeCommit as MergeCommitView).parents as unknown[])[1] !== (expected as ExpectedView).bSha) {
    throw new Error('Merge commit parents are not the recorded base followed by exact B.');
  }
  if ((mergeCommit as MergeCommitView).tree !== (expected as ExpectedView).bTree) {
    throw new Error('Merge commit tree differs from exact B tree.');
  }

  const expectedRef = `refs/heads/${(expected as ExpectedView).targetBranch as string}`;
  if ((targetRef as TargetRefView).ref !== expectedRef) throw new Error('Readback ref is not the expected target branch.');
  requireObjectId((targetRef as TargetRefView).sha, 'Target ref SHA');
  if ((targetCommit as TargetCommitView).sha !== (targetRef as TargetRefView).sha) throw new Error('Target commit does not match the observed target ref.');
  requireObjectId((targetCommit as TargetCommitView).sha, 'Target commit SHA');
  if (!Array.isArray((targetCommit as TargetCommitView).ancestorShas)) throw new Error('Target commit ancestry is missing.');
  ((targetCommit as TargetCommitView).ancestorShas as unknown[]).forEach((sha, index) => requireObjectId(sha, `Target ancestor ${index + 1}`));
  if ((targetCommit as TargetCommitView).sha !== (mergeCommit as MergeCommitView).sha && !((targetCommit as TargetCommitView).ancestorShas as unknown[]).includes((mergeCommit as MergeCommitView).sha)) {
    throw new Error('Observed target ref does not contain the PR merge commit.');
  }

  const authoritySnapshot = (targetCommit as TargetCommitView).authoritySnapshot;
  requireObject(authoritySnapshot, 'Target authority snapshot');
  if ((authoritySnapshot as AuthoritySnapshotView).commitSha !== (targetRef as TargetRefView).sha) {
    throw new Error('Authority bytes are not bound to the observed target commit.');
  }
  if ((authoritySnapshot as AuthoritySnapshotView).path !== (expected as ExpectedView).authorityPath) {
    throw new Error('Authority bytes are not from the expected authority path.');
  }
  const authorityBytes = (authoritySnapshot as AuthoritySnapshotView).bytes;
  if (!Buffer.isBuffer(authorityBytes) && !(authorityBytes instanceof Uint8Array)) {
    throw new TypeError('Authority readback must be exact file bytes.');
  }
  const authorityDigest = sha256(authorityBytes);
  if (authorityDigest !== (expected as ExpectedView).authorityDigest) {
    throw new Error('Canonical authority bytes differ from the expected B authority state.');
  }

  const merge = {
    hostMetadata: {
      status: 'verified' as const,
      repository,
      targetBranch: (expected as ExpectedView).targetBranch,
      pullRequestNumber: (expected as ExpectedView).pullRequestNumber,
      headSha: (expected as ExpectedView).bSha,
      baseSha: (expected as ExpectedView).baseSha,
      state: 'merged' as const,
      mergeSha: (mergeCommit as MergeCommitView).sha,
      mergedAt: new Date(Date.parse((pullRequest as PullRequestView).merged_at as string)).toISOString(),
    },
    commit: {
      sha: (mergeCommit as MergeCommitView).sha,
      parents: [...((mergeCommit as MergeCommitView).parents as unknown[])],
      tree: (mergeCommit as MergeCommitView).tree,
    },
  };
  const targetReadback = {
    status: 'verified' as const,
    repository,
    targetRef: expectedRef,
    targetSha: (targetRef as TargetRefView).sha,
    ancestorShas: [...((targetCommit as TargetCommitView).ancestorShas as unknown[])],
    authorityDigest,
  };

  return { merge, targetReadback };
}
