import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const codeowners = await readFile(new URL('../.github/CODEOWNERS', import.meta.url), 'utf8');

const rules = codeowners
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const [pattern, ...owners] = line.split(/\s+/u);
    return { pattern, owners };
  });

function matches(pattern, path) {
  if (pattern === '*') return true;
  const rootAnchored = pattern.startsWith('/');
  const normalized = pattern.replace(/^\//u, '');
  if (normalized.endsWith('/')) {
    return rootAnchored
      ? path.startsWith(normalized)
      : path.includes(normalized);
  }
  return rootAnchored
    ? path === normalized
    : path.split('/').includes(normalized);
}

function ownersFor(path) {
  return rules.filter(({ pattern }) => matches(pattern, path)).at(-1)?.owners;
}

test('routes governing and security-sensitive paths to their intended teams', () => {
  assert.deepEqual(ownersFor('README.md'), [
    '@flair-agency/architecture',
    '@flair-agency/engineering',
  ]);
  assert.deepEqual(ownersFor('package.json'), [
    '@flair-agency/architecture',
    '@flair-agency/engineering',
  ]);
  assert.deepEqual(ownersFor('test/ci-workflow.test.mjs'), [
    '@flair-agency/architecture',
    '@flair-agency/engineering',
  ]);
  assert.deepEqual(ownersFor('.github/workflows/architecture-gate.yml'), [
    '@flair-agency/security',
    '@flair-agency/architecture',
  ]);
  assert.deepEqual(ownersFor('.github/CODEOWNERS'), [
    '@flair-agency/security',
    '@flair-agency/architecture',
  ]);
  assert.deepEqual(ownersFor('examples/README.md'), [
    '@flair-agency/engineering',
  ]);
});
