import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-5.6-sol', reasoningEffort: 'medium' } } };
test('resolves exact base-branch policy', () => assert.deepEqual(resolveCiPolicy(policy, 'main'), { baseBranch: 'main', mode: 'enforced', model: 'gpt-5.6-sol', reasoningEffort: 'medium' }));
test('uses explicit local-only default', () => assert.equal(resolveCiPolicy(policy, 'preview').mode, 'local-only'));
test('rejects incomplete enforcement', () => assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { mode: 'enforced' } } }, 'main')));

test('keeps protected codex-action arguments compatible', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  assert.match(workflow, /safety-strategy: drop-sudo/);
  assert.doesNotMatch(workflow, /--ignore-user-config/);
});

test('uses the immutable called-workflow runtime and keeps review jobs read-only', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.doesNotMatch(workflow, /ref: v0\.1\.0/);
  assert.match(workflow, /review:\n[\s\S]*?permissions:\n      contents: read/);
  assert.match(workflow, /src\/ci-report\.mjs/);
  assert.match(workflow, /CONCLUSION: \$\{\{ steps\.report\.outputs\.conclusion \}\}/);
  assert.doesNotMatch(workflow, /JSON\.parse\(process\.env\.DECISION\)/);
  assert.match(workflow, /group: architecture-gate-\$\{\{ github\.repository \}\}-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});
