import { createHash } from 'node:crypto';

const OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256 = /^[a-f0-9]{64}$/;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function requireObjectId(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new TypeError(`${label} is not a Git object ID.`);
  }
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new TypeError(`${label} is not a SHA-256 digest.`);
  }
}

function sha256(bytes) {
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
export function verifyOwnerAdditionReadback(input) {
  requireObject(input, 'Readback input');
  const { repository, expected, pullRequest, mergeCommit, targetRef, targetCommit } = input;
  requireObject(expected, 'Expected candidate');
  requireObject(pullRequest, 'GitHub pull request metadata');
  requireObject(mergeCommit, 'Git merge commit');
  requireObject(targetRef, 'Target ref');
  requireObject(targetCommit, 'Target commit');

  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new TypeError('Repository must be an owner/name identity.');
  }
  if (typeof expected.targetBranch !== 'string' || !expected.targetBranch ||
      expected.targetBranch.startsWith('refs/') || expected.targetBranch.includes('..')) {
    throw new TypeError('Expected target branch is invalid.');
  }
  if (!Number.isSafeInteger(expected.pullRequestNumber) || expected.pullRequestNumber < 1) {
    throw new TypeError('Expected pull request number is invalid.');
  }
  for (const key of ['baseSha', 'bSha', 'bTree']) requireObjectId(expected[key], `Expected ${key}`);
  if (typeof expected.authorityPath !== 'string' || !expected.authorityPath ||
      expected.authorityPath.startsWith('/') || expected.authorityPath.split('/').includes('..')) {
    throw new TypeError('Expected authority path is invalid.');
  }
  requireDigest(expected.authorityDigest, 'Expected authority digest');

  if (pullRequest.number !== expected.pullRequestNumber ||
      pullRequest.state !== 'closed' || pullRequest.merged !== true) {
    throw new Error('GitHub metadata does not identify the expected merged pull request.');
  }
  if (pullRequest.base?.ref !== expected.targetBranch ||
      pullRequest.base?.repo?.full_name?.toLowerCase() !== repository.toLowerCase()) {
    throw new Error('GitHub pull request metadata does not bind the expected repository and target branch.');
  }
  if (pullRequest.head?.sha !== expected.bSha) {
    throw new Error('Merged pull request head differs from exact B.');
  }
  requireObjectId(pullRequest.merge_commit_sha, 'GitHub merge commit SHA');
  if (typeof pullRequest.merged_at !== 'string' || !Number.isFinite(Date.parse(pullRequest.merged_at))) {
    throw new Error('GitHub merged timestamp is missing or invalid.');
  }

  requireObjectId(mergeCommit.sha, 'Merge commit SHA');
  requireObjectId(mergeCommit.tree, 'Merge commit tree');
  if (pullRequest.merge_commit_sha !== mergeCommit.sha) {
    throw new Error('GitHub merge SHA differs from the read merge commit.');
  }
  if (!Array.isArray(mergeCommit.parents) || mergeCommit.parents.length !== 2) {
    throw new Error('Only an ordinary two-parent merge commit is supported.');
  }
  mergeCommit.parents.forEach((parent, index) => requireObjectId(parent, `Merge parent ${index + 1}`));
  if (mergeCommit.parents[0] !== expected.baseSha || mergeCommit.parents[1] !== expected.bSha) {
    throw new Error('Merge commit parents are not the recorded base followed by exact B.');
  }
  if (mergeCommit.tree !== expected.bTree) {
    throw new Error('Merge commit tree differs from exact B tree.');
  }

  const expectedRef = `refs/heads/${expected.targetBranch}`;
  if (targetRef.ref !== expectedRef) throw new Error('Readback ref is not the expected target branch.');
  requireObjectId(targetRef.sha, 'Target ref SHA');
  if (targetCommit.sha !== targetRef.sha) throw new Error('Target commit does not match the observed target ref.');
  requireObjectId(targetCommit.sha, 'Target commit SHA');
  if (!Array.isArray(targetCommit.ancestorShas)) throw new Error('Target commit ancestry is missing.');
  targetCommit.ancestorShas.forEach((sha, index) => requireObjectId(sha, `Target ancestor ${index + 1}`));
  if (targetCommit.sha !== mergeCommit.sha && !targetCommit.ancestorShas.includes(mergeCommit.sha)) {
    throw new Error('Observed target ref does not contain the PR merge commit.');
  }

  const authoritySnapshot = targetCommit.authoritySnapshot;
  requireObject(authoritySnapshot, 'Target authority snapshot');
  if (authoritySnapshot.commitSha !== targetRef.sha) {
    throw new Error('Authority bytes are not bound to the observed target commit.');
  }
  if (authoritySnapshot.path !== expected.authorityPath) {
    throw new Error('Authority bytes are not from the expected authority path.');
  }
  const authorityBytes = authoritySnapshot.bytes;
  if (!Buffer.isBuffer(authorityBytes) && !(authorityBytes instanceof Uint8Array)) {
    throw new TypeError('Authority readback must be exact file bytes.');
  }
  const authorityDigest = sha256(authorityBytes);
  if (authorityDigest !== expected.authorityDigest) {
    throw new Error('Canonical authority bytes differ from the expected B authority state.');
  }

  const merge = {
    hostMetadata: {
      status: 'verified',
      repository,
      targetBranch: expected.targetBranch,
      pullRequestNumber: expected.pullRequestNumber,
      headSha: expected.bSha,
      baseSha: expected.baseSha,
      state: 'merged',
      mergeSha: mergeCommit.sha,
      mergedAt: new Date(Date.parse(pullRequest.merged_at)).toISOString(),
    },
    commit: {
      sha: mergeCommit.sha,
      parents: [...mergeCommit.parents],
      tree: mergeCommit.tree,
    },
  };
  const targetReadback = {
    status: 'verified',
    repository,
    targetRef: expectedRef,
    targetSha: targetRef.sha,
    ancestorShas: [...targetCommit.ancestorShas],
    authorityDigest,
  };

  return { merge, targetReadback };
}
