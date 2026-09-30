import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProvenance } from '../src/verify-codex-action.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'provenance/codex-action-v1.12-linux-test-fix.json'), 'utf8'));
const runtimeManifest = JSON.parse(readFileSync(join(root, 'provenance/codex-action-v1.12-runtime-cancellation.json'), 'utf8'));
const observed = {
  baseCommit: manifest.baseCommit,
  baseTree: manifest.baseTree,
  headCommit: manifest.headCommit,
  headTree: manifest.headTree,
  commits: [...manifest.commits],
  changedFiles: Object.keys(manifest.files).sort(),
  fileHashes: { ...manifest.files },
};
const runtimeObserved = {
  baseCommit: runtimeManifest.baseCommit,
  baseTree: runtimeManifest.baseTree,
  headCommit: runtimeManifest.headCommit,
  headTree: runtimeManifest.headTree,
  commits: [...runtimeManifest.commits],
  changedFiles: Object.keys(runtimeManifest.files).sort(),
  fileHashes: { ...runtimeManifest.files },
};

test('accepts the complete reviewed Codex Action provenance', () => {
  assert.equal(manifest.gatekeeperPullRequest, 9);
  assert.equal(manifest.headCommit, '8d35ab0e294c9ca3603f738c9cdf74d53081852f');
  assert.equal(manifest.commits.at(-1), manifest.headCommit);
  assert.equal(manifest.files['test/dropSudo.test.mjs'], '3f691eb5c2787d8e2d68c05e785eb53bea34419f172f752e1660ff37963dcee8');
  assert.equal(verifyProvenance(manifest, observed), true);
});

test('accepts the merged, Linux-verified runtime-cancellation Action tree', () => {
  assert.equal(runtimeManifest.repository, 'flair-agency/codex-action');
  assert.equal(runtimeManifest.baseCommit, 'fa9d23b20e0ebcae09901de79690f099cda237be');
  assert.equal(runtimeManifest.headCommit, '643fb31fa44e961453125534c4c7182a5a0a6ba0');
  assert.equal(runtimeManifest.headTree, 'ea68a0e7f2fc39f9c6f8fd9cda26b362aaf6ded8');
  assert.equal(runtimeManifest.commits.length, 12);
  assert.equal(runtimeManifest.commits.at(-1), runtimeManifest.headCommit);
  assert.deepEqual(Object.keys(runtimeManifest.files).sort(), [
    'README.md',
    'action.yml',
    'dist/main.js',
    'src/main.ts',
    'src/runCodexExec.ts',
    'test/dropSudo.test.mjs',
    'test/runCodexExec.test.mjs',
  ]);
  assert.equal(runtimeManifest.files['dist/main.js'], 'caaf2bb17824bd9aa2383d8c5359896b3ec51b2338e177c60027020e85b95631');
  assert.equal(verifyProvenance(runtimeManifest, runtimeObserved), true);
});

for (const mutation of [
  ['head tree', (value) => { value.headTree = '0'.repeat(40); }],
  ['commit sequence', (value) => { value.commits = value.commits.slice(1); }],
  ['changed file set', (value) => { value.changedFiles = value.changedFiles.slice(1); }],
  ['file content', (value) => { value.fileHashes['dist/main.js'] = '0'.repeat(64); }],
]) {
  test(`rejects drift in ${mutation[0]}`, () => {
    const value = structuredClone(observed);
    mutation[1](value);
    assert.throws(() => verifyProvenance(manifest, value));
  });
}
