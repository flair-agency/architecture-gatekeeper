import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { resolveOwnerAmendmentHandoffGitContext } from '../src/owner-amendment-handoff-git-context.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const policyPath = '.codex/gatekeeper/ci-policy.json';
const manifestPath = '.codex/gatekeeper/authorities.json';
const authorityPath = 'docs/architecture.md';
const limits = { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 65_536,
  maxTotalBytes: 262_144, maxPromptBytes: 524_288 };
const policy = {
  version: 2,
  default: { mode: 'local-only' },
  branches: { main: { mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium',
    authorityManifestPath: manifestPath, authorityLimits: limits,
    ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only',
      triggerProfile: 'completed-block-v1', authorityId: 'architecture-contract',
      authorityPath, evidenceProducer: 'github-actions-attestation',
      tagNamespace: 'refs/tags/architecture-gatekeeper/amendments' } } },
};
const manifest = { version: 1, authorities: [{ id: 'architecture-contract', repository: 'self',
  revision: 'authority-revision', path: authorityPath }] };

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } });
}

function put(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  if (value?.symlink) symlinkSync(value.symlink, target);
  else writeFileSync(target, value);
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '--allow-empty', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
}

function fixture({ basePolicy = policy, baseManifest = manifest, baseAuthority = 'old architecture\n',
  headAuthority = 'amended architecture\n', extraHeadFiles = {}, basePolicySymlink = false,
  baseManifestSymlink = false, headAuthoritySymlink = false, unrelatedHead = false,
  removeHeadAuthority = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agk-handoff-git-context-'));
  git(root, ['init', '-q']);
  put(root, policyPath, basePolicySymlink ? { symlink: 'missing-policy-target' } : JSON.stringify(basePolicy));
  put(root, manifestPath, baseManifestSymlink ? { symlink: 'missing-manifest-target' } : JSON.stringify(baseManifest));
  put(root, authorityPath, baseAuthority);
  const baseSha = commit(root, 'base');
  if (removeHeadAuthority) {
    rmSync(join(root, authorityPath));
  } else if (headAuthoritySymlink) {
    rmSync(join(root, authorityPath));
    put(root, authorityPath, { symlink: 'external-authority.md' });
  } else {
    put(root, authorityPath, headAuthority);
  }
  if (unrelatedHead) put(root, 'src/implementation.js', 'implementation changed\n');
  for (const [path, value] of Object.entries(extraHeadFiles)) put(root, path, value);
  const headSha = commit(root, 'candidate B');
  return { root, baseSha, headSha, runGit: args => git(root, args), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function resolve(f) {
  return resolveOwnerAmendmentHandoffGitContext({ repository, baseSha: f.baseSha, headSha: f.headSha, runGit: f.runGit });
}

test('resolves base-selected G0 policy, manifest, exact authority bytes and one-file B scope', () => {
  const f = fixture();
  try {
    const result = resolve(f);
    assert.equal(result.repository, repository);
    assert.equal(result.baseSha, f.baseSha);
    assert.equal(result.headSha, f.headSha);
    assert.deepEqual(result.changedFiles, [{ path: authorityPath, status: 'modified' }]);
    assert.equal(result.policy.ownerAmendmentTriggerProfile, 'completed-block-v1');
    assert.equal(result.manifest.authorities[0].path, authorityPath);
    assert.equal(result.authorityBytes.base.toString(), 'old architecture\n');
    assert.equal(result.authorityBytes.head.toString(), 'amended architecture\n');
    assert.equal(result.scope.baseSha, f.baseSha);
    assert.equal(result.scope.headSha, f.headSha);
    assert.equal(Object.hasOwn(result, 'accepted'), false);
  } finally { f.cleanup(); }
});

test('fails closed for noncanonical repository, missing policy opt-in, and added implementation', () => {
  const f = fixture({ unrelatedHead: true });
  try {
    assert.throws(() => resolve(f), /authority-only scope/);
    assert.throws(() => resolveOwnerAmendmentHandoffGitContext({ repository: 'bad', baseSha: f.baseSha, headSha: f.headSha, runGit: f.runGit }), /canonical/);
  } finally { f.cleanup(); }

  const noOptIn = fixture({ basePolicy: { version: 2, default: { mode: 'local-only' }, branches: { main: { mode: 'local-only' } } } });
  try { assert.throws(() => resolve(noOptIn), /cannot be resolved|does not select/); }
  finally { noOptIn.cleanup(); }
});

test('rejects symlinked protected policy, manifest, or B authority', () => {
  for (const options of [{ basePolicySymlink: true }, { baseManifestSymlink: true }, { headAuthoritySymlink: true }]) {
    const f = fixture(options);
    try { assert.throws(() => resolve(f)); }
    finally { f.cleanup(); }
  }
});

test('rejects malformed selected manifest and missing or oversized authority blobs', () => {
  const malformed = fixture({ baseManifest: '{"version":1,"version":1,"authorities":[]}' });
  try { assert.throws(() => resolve(malformed), /manifest is invalid/); }
  finally { malformed.cleanup(); }

  const missingHead = fixture({ removeHeadAuthority: true });
  try {
    // A missing selected member is never treated as a valid amendment input.
    assert.throws(() => resolve(missingHead));
  } finally { missingHead.cleanup(); }

  const constrained = structuredClone(policy);
  constrained.branches.main.authorityLimits = { ...limits, maxFileBytes: 256, maxTotalBytes: 16 };
  const overTotal = fixture({ basePolicy: constrained, baseAuthority: 'old architecture bytes\n' });
  try { assert.throws(() => resolve(overTotal), /protected size limit/); }
  finally { overTotal.cleanup(); }
});

test('requires exact base ancestry and rejects malformed injected Git output', () => {
  const f = fixture();
  try {
    const malformedGit = args => {
      if (args[1] === 'cat-file' && args[2] === '-t') return Buffer.from('tree\n');
      return f.runGit(args);
    };
    assert.throws(() => resolveOwnerAmendmentHandoffGitContext({ repository, baseSha: f.baseSha,
      headSha: f.headSha, runGit: malformedGit }), /not a commit/);
    assert.throws(() => resolveOwnerAmendmentHandoffGitContext({ repository, baseSha: f.headSha,
      headSha: f.baseSha, runGit: f.runGit }), /ancestor/);
    assert.throws(() => resolveOwnerAmendmentHandoffGitContext({ repository, baseSha: 'z'.repeat(40),
      headSha: f.headSha, runGit: f.runGit }), /SHAs/);
  } finally { f.cleanup(); }
});

test('ignores local replacement refs when resolving exact protected objects', () => {
  const f = fixture();
  try {
    const replacement = git(f.root, ['commit-tree', git(f.root, ['rev-parse', `${f.baseSha}^{tree}`]).toString('ascii').trim(), '-m', 'replacement']).toString('ascii').trim();
    git(f.root, ['replace', f.headSha, replacement]);
    const result = resolve(f);
    assert.equal(result.scope.headSha, f.headSha);
    assert.equal(result.authorityBytes.head.toString(), 'amended architecture\n');
  } finally { f.cleanup(); }
});

test('does not expose mutable protected bytes or parsed context', () => {
  const f = fixture();
  try {
    const result = resolve(f);
    result.authorityBytes.head[0] = 0x58;
    result.policyBytes[0] = 0x58;
    result.manifestBytes[0] = 0x58;
    assert.equal(result.authorityBytes.head.toString(), 'amended architecture\n');
    assert.equal(result.policyBytes[0], 0x7b);
    assert.equal(result.manifestBytes[0], 0x7b);
    assert.throws(() => { result.policy.ownerAmendmentGrade = 'G1'; }, TypeError);
    assert.throws(() => { result.manifest.authorities[0].path = 'other.md'; }, TypeError);
  } finally { f.cleanup(); }
});
