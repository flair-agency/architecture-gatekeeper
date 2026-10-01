import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { deriveOwnerAmendmentGitChanges, computeOwnerAmendmentResultingAuthoritySet } from '../src/owner-amendment-git-changes.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } });
}
function put(root, path, bytes) {
  const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
}
function commit(root) {
  git(root, ['add', '-A']); git(root, ['commit', '--allow-empty', '-m', 'fixture']);
  return git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
}

test('binds every OWNER_DECISION authority blob and the complete unfiltered Git diff', () => {
  const root = mkdtempSync(join(tmpdir(), 'agk-multipath-git-changes-'));
  try {
    git(root, ['init', '-q']);
    const beforeA = Buffer.from('prior selected authority\n'), beforeB = Buffer.from('prior second authority\n');
    const afterA = Buffer.from('amended selected authority\n'), afterB = Buffer.from('amended second authority\n');
    put(root, 'docs/architecture.md', beforeA); put(root, 'docs/ownership.md', beforeB);
    const baseSha = commit(root);
    put(root, 'docs/architecture.md', afterA); put(root, 'docs/ownership.md', afterB);
    const bSha = commit(root);
    const readBlob = (revision, path) => git(root, ['--no-replace-objects', 'show', `${revision}:${path}`]);
    const authorityChanges = [
      { path: 'docs/architecture.md', beforeBytes: beforeA, afterBytes: afterA },
      { path: 'docs/ownership.md', beforeBytes: beforeB, afterBytes: afterB },
    ];
    const changedFiles = authorityChanges.map(({ path }) => ({ path, status: 'modified' }));
    const members = [
      { id: 'architecture-contract', repository, resolvedCommit: baseSha, path: 'docs/architecture.md',
        byteLength: beforeA.length, sha256: sha256(beforeA), content: beforeA },
      { id: 'ownership-charter', repository, resolvedCommit: baseSha, path: 'docs/ownership.md',
        byteLength: beforeB.length, sha256: sha256(beforeB), content: beforeB },
    ];
    const runGit = args => git(root, args);
    const result = deriveOwnerAmendmentGitChanges({ profile: 'completed-owner-decision-self-v1', repository,
      baseSha, bSha, targetPath: 'docs/architecture.md',
      selectedAuthorityBytes: { base: beforeA, head: afterA }, changedFiles, authorityChanges, runGit, readBlob });
    assert.deepEqual(result.changes.map(change => change.path), ['docs/architecture.md', 'docs/ownership.md']);
    assert.deepEqual(result.changes[1].beforeBytes, readBlob(baseSha, 'docs/ownership.md'));
    assert.deepEqual(result.changes[1].afterBytes, readBlob(bSha, 'docs/ownership.md'));
    assert.match(result.diffBytes.toString('utf8'), /diff --git a\/docs\/ownership\.md b\/docs\/ownership\.md/);
    assert.match(result.diffBytes.toString('utf8'), /diff --git a\/docs\/architecture\.md b\/docs\/architecture\.md/);

    const canonicalDigest = descriptors => sha256(Buffer.from(JSON.stringify(descriptors), 'utf8'));
    const prior = canonicalDigest(members.map(({ content, ...member }) => member));
    const expectedDescriptors = members.map((member, index) => ({ id: member.id, repository: member.repository,
      resolvedCommit: member.resolvedCommit, path: member.path,
      byteLength: index === 0 ? afterA.length : afterB.length, sha256: sha256(index === 0 ? afterA : afterB) }));
    const resulting = canonicalDigest(expectedDescriptors);
    const rebound = computeOwnerAmendmentResultingAuthoritySet({ members, changes: result.changes, repository, baseSha,
      expectedPriorDigest: prior, expectedResultingDigest: resulting });
    assert.equal(rebound.priorDigest, prior);
    assert.equal(rebound.resultingDigest, resulting);
    assert.equal(rebound.descriptors[1].sha256, sha256(afterB));

    assert.throws(() => deriveOwnerAmendmentGitChanges({ profile: 'completed-owner-decision-self-v1', repository,
      baseSha, bSha, targetPath: 'docs/architecture.md', selectedAuthorityBytes: { base: beforeA, head: afterA },
      changedFiles, authorityChanges: authorityChanges.slice(0, 1), runGit, readBlob }), /complete modified Git path set/);
    assert.throws(() => deriveOwnerAmendmentGitChanges({ profile: 'completed-owner-decision-self-v1', repository,
      baseSha, bSha, targetPath: 'docs/architecture.md', selectedAuthorityBytes: { base: beforeA, head: afterA },
      changedFiles, authorityChanges: authorityChanges.map((change, index) => index ? { ...change, afterBytes: beforeA } : change),
      runGit, readBlob }), /Git bytes differ/);
    assert.throws(() => computeOwnerAmendmentResultingAuthoritySet({ members, changes: result.changes, repository,
      baseSha, expectedPriorDigest: prior, expectedResultingDigest: '0'.repeat(64) }), /resulting Authority Set digest/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
