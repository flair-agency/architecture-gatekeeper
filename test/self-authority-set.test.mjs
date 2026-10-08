import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateAuthoritySetDecision } from '../dist/authority-set.mjs';
import { prepareAuthoritySet } from '../dist/prepare-authority-set.mjs';
import { createReviewRequestAsync } from '../dist/review-contract.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../dist/resolve-ci-policy.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(sourceRoot, path));
const manifest = JSON.parse(read('.codex/gatekeeper/authorities.json'));
const config = JSON.parse(read('.codex/gatekeeper/config.json'));
const selected = resolveCiPolicy(parseCiPolicyJson(read('.codex/gatekeeper/ci-policy.json').toString()), 'main');
const limits = JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString());
const expectedIds = ['architecture-contract', 'architecture-authority-set',
  'architecture-owner-addition', 'architecture-owner-amendment',
  'architecture-review-execution', 'architecture-self-profile'];
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'self-authority-set-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo'); mkdirSync(root);
  const paths = new Set([config.authorityManifestPath, '.codex/gatekeeper/config.json',
    config.promptPath, config.schemaPath, config.validationPath, config.reviewerConfigPath,
    ...manifest.authorities.map(member => member.path)]);
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), read(path));
  }
  git(root, 'init'); git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic self authority snapshot');
  return { parent, root, revision: git(root, 'rev-parse', 'HEAD') };
}

test('self local and CI preparation supply all six complete committed contract members', async t => {
  assert.deepEqual(manifest.authorities.map(member => member.id), expectedIds);
  assert.deepEqual(config.authorityLimits, limits);
  assert.equal(selected.authorityManifestPath, config.authorityManifestPath);
  assert.equal(selected.ownerAmendmentAuthorityId, 'architecture-contract');
  assert.equal(selected.ownerAmendmentAuthorityPath, 'docs/architecture.md');
  const f = fixture(t);
  // A working-tree replacement must not replace a committed normative module.
  writeFileSync(join(f.root, manifest.authorities[1].path), '# Unadopted replacement\n');
  const local = await createReviewRequestAsync('Synthetic preparation; no model invocation.', f.root);
  const { provenance } = await prepareAuthoritySet({
    manifestPath: join(f.root, config.authorityManifestPath), limits,
    selfRepository: config.selfRepository, selfRoot: f.root,
    authorityRevision: f.revision, outputDir: join(f.parent, 'ci-bundle'),
  });
  assert.deepEqual(local.authoritySet.members, provenance.members);
  assert.equal(local.authoritySet.setDigest, provenance.setDigest);
  assert.deepEqual(provenance.members.map(member => member.id), expectedIds);
  const ciPrompt = readFileSync(join(f.parent, 'ci-bundle/authority-prompt.md'), 'utf8');
  for (const [index, member] of manifest.authorities.entries()) {
    const bytes = read(member.path);
    assert.equal(provenance.members[index].byteLength, bytes.length);
    assert.equal(provenance.members[index].sha256, sha(bytes));
    assert.equal(provenance.members[index].resolvedCommit, f.revision);
    assert.ok(bytes.length <= limits.maxFileBytes);
    assert.ok(local.prompt.includes(JSON.stringify(bytes.toString())));
    assert.ok(ciPrompt.includes(JSON.stringify(bytes.toString())));
  }
  assert.ok(provenance.members.reduce((total, member) => total + member.byteLength, 0) <= limits.maxTotalBytes);
  assert.ok(Buffer.byteLength(local.prompt) <= config.authorityLimits.maxPromptBytes);
  assert.ok(Buffer.byteLength(ciPrompt) <= limits.maxPromptBytes);
  assert.doesNotMatch(local.prompt, /Unadopted replacement/);
  assert.doesNotMatch(ciPrompt, /Unadopted replacement/);
  for (const decision of ['PASS', 'BLOCK', 'OWNER_DECISION']) {
    validateAuthoritySetDecision({ decision, authorityIds: expectedIds }, provenance);
    assert.throws(() => validateAuthoritySetDecision({ decision, authorityIds: expectedIds.slice(0, -1) }, provenance), /complete/);
    assert.throws(() => validateAuthoritySetDecision({ decision, authorityIds: [...expectedIds.slice(0, -1), expectedIds[0]] }, provenance), /duplicate/);
  }
});

test('each missing self contract member leaves local and CI preparation incomplete', async t => {
  const f = fixture(t);
  for (const [index, member] of manifest.authorities.entries()) {
    git(f.root, 'rm', member.path); git(f.root, 'commit', '-m', 'Synthetic missing member');
    const revision = git(f.root, 'rev-parse', 'HEAD');
    await assert.rejects(createReviewRequestAsync('Synthetic missing-source check.', f.root));
    const outputDir = join(f.parent, `missing-${index}`);
    await assert.rejects(prepareAuthoritySet({
      manifestPath: join(f.root, config.authorityManifestPath), limits,
      selfRepository: config.selfRepository, selfRoot: f.root,
      authorityRevision: revision, outputDir,
    }));
    assert.equal(existsSync(outputDir), false);
    writeFileSync(join(f.root, member.path), read(member.path));
    git(f.root, 'add', member.path); git(f.root, 'commit', '-m', 'Restore synthetic member');
  }
});
