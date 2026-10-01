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
  assert.equal(runtimeManifest.headCommit, '308ab1c8ce784cd5f46b98a1c0801c5c040918d9');
  assert.equal(runtimeManifest.headTree, '58a320f7d919d6e5bd84c96f9d82a989173d9501');
  assert.equal(runtimeManifest.commits.length, 18);
  assert.equal(runtimeManifest.commits.at(-1), runtimeManifest.headCommit);
  assert.deepEqual(Object.keys(runtimeManifest.files).sort(), [
    'README.md',
    'action.yml',
    'dist/main.js',
    'docs/security.md',
    'src/lifecycleTrace.ts',
    'src/main.ts',
    'src/runCodexExec.ts',
    'test/dropSudo.test.mjs',
    'test/lifecycleTrace.test.mjs',
    'test/runCodexExec.test.mjs',
    'test/runCodexExecStreams.test.mjs',
  ]);
  assert.equal(runtimeManifest.files['dist/main.js'], 'b4bf276c3a9a57ddabdab84c769b2b58683cadc2a98c866a890f6814b3726ab9');
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
