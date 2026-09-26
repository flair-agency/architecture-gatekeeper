import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyOwnerAdditionReadback } from '../src/github-owner-addition-readback.mjs';

const oid = (digit) => digit.repeat(40);
const bytes = Buffer.from('canonical authority with the adopted decision\n');
const authorityDigest = createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const baseSha = oid('1');
  const bSha = oid('2');
  const bTree = oid('3');
  const mergeSha = oid('4');
  const targetSha = oid('5');
  return {
    repository: 'flair-agency/example',
    expected: {
      targetBranch: 'main',
      pullRequestNumber: 17,
      baseSha,
      bSha,
      bTree,
      authorityPath: 'docs/architecture.md',
      authorityDigest,
    },
    pullRequest: {
      number: 17,
      state: 'closed',
      merged: true,
      merged_at: '2026-09-26T08:24:34Z',
      head: { sha: bSha },
      base: { ref: 'main', repo: { full_name: 'flair-agency/example' } },
      merge_commit_sha: mergeSha,
    },
    mergeCommit: { sha: mergeSha, parents: [baseSha, bSha], tree: bTree },
    targetRef: { ref: 'refs/heads/main', sha: targetSha },
    targetCommit: {
      sha: targetSha,
      ancestorShas: [mergeSha, bSha, baseSha],
      authoritySnapshot: {
        commitSha: targetSha,
        path: 'docs/architecture.md',
        bytes,
      },
    },
  };
}

test('verifies ordinary merged PR, exact merge parents/tree and canonical target readback', () => {
  const verified = verifyOwnerAdditionReadback(fixture());

  assert.deepEqual(verified.merge, {
    hostMetadata: {
      status: 'verified',
      repository: 'flair-agency/example',
      targetBranch: 'main',
      pullRequestNumber: 17,
      headSha: oid('2'),
      baseSha: oid('1'),
      state: 'merged',
      mergeSha: oid('4'),
      mergedAt: '2026-09-26T08:24:34.000Z',
    },
    commit: { sha: oid('4'), parents: [oid('1'), oid('2')], tree: oid('3') },
  });
  assert.deepEqual(verified.targetReadback, {
    status: 'verified',
    repository: 'flair-agency/example',
    targetRef: 'refs/heads/main',
    targetSha: oid('5'),
    ancestorShas: [oid('4'), oid('2'), oid('1')],
    authorityDigest,
  });
});

test('rejects a PR that is not merged or whose head differs from exact B', () => {
  const notMerged = fixture();
  notMerged.pullRequest.merged = false;
  assert.throws(() => verifyOwnerAdditionReadback(notMerged), /merged pull request/);

  const wrongHead = fixture();
  wrongHead.pullRequest.head.sha = oid('6');
  assert.throws(() => verifyOwnerAdditionReadback(wrongHead), /head differs from exact B/);
});

test('rejects squash/rebase shape, wrong base parent, or changed merge tree', () => {
  const squash = fixture();
  squash.mergeCommit.parents = [squash.expected.baseSha];
  assert.throws(() => verifyOwnerAdditionReadback(squash), /two-parent merge commit/);

  const wrongParent = fixture();
  wrongParent.mergeCommit.parents[0] = oid('6');
  assert.throws(() => verifyOwnerAdditionReadback(wrongParent), /recorded base followed by exact B/);

  const wrongTree = fixture();
  wrongTree.mergeCommit.tree = oid('6');
  assert.throws(() => verifyOwnerAdditionReadback(wrongTree), /tree differs from exact B/);
});

test('rejects a target ref that does not contain the merge commit', () => {
  const input = fixture();
  input.targetCommit.ancestorShas = [input.expected.baseSha];
  assert.throws(() => verifyOwnerAdditionReadback(input), /does not contain the PR merge commit/);
});

test('binds authority bytes to exact observed target commit and expected path and digest', () => {
  const wrongCommit = fixture();
  wrongCommit.targetCommit.authoritySnapshot.commitSha = oid('6');
  assert.throws(() => verifyOwnerAdditionReadback(wrongCommit), /not bound to the observed target commit/);

  const wrongPath = fixture();
  wrongPath.targetCommit.authoritySnapshot.path = 'docs/other.md';
  assert.throws(() => verifyOwnerAdditionReadback(wrongPath), /expected authority path/);

  const changedAuthority = fixture();
  changedAuthority.targetCommit.authoritySnapshot.bytes = Buffer.from('different authority');
  assert.throws(() => verifyOwnerAdditionReadback(changedAuthority), /Canonical authority bytes differ/);
});
