import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProvenance } from '../src/verify-codex-action.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'provenance/codex-action-v1.12-linux-test-fix.json'), 'utf8'));
const observed = {
  baseCommit: manifest.baseCommit,
  baseTree: manifest.baseTree,
  headCommit: manifest.headCommit,
  headTree: manifest.headTree,
  commits: [...manifest.commits],
  changedFiles: Object.keys(manifest.files).sort(),
  fileHashes: { ...manifest.files },
};

test('accepts the complete reviewed Codex Action provenance', () => {
  assert.equal(manifest.gatekeeperPullRequest, 7);
  assert.equal(manifest.headCommit, 'e47781445af6df3039f835c86ee5bbf4a61d80fe');
  assert.equal(manifest.commits.at(-1), manifest.headCommit);
  assert.equal(manifest.files['test/dropSudo.test.mjs'], '6855e9c5a87a49db3041fc980693069ed004c1ba5f52f1567d5c9bbd93b3775f');
  assert.equal(verifyProvenance(manifest, observed), true);
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
