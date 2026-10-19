import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const fixtureRoot = join(root, 'test/fixtures/legacy-authority-decision-contract');
const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFixture = compileFixtureDiagnostics(fixtureFiles,
  { ...parsed.options, rootDir: root, noEmit: true }, 'every transitive diagnostic must remain clean');
for (const name of ['positive.mts', 'negative.mts']) {
  test(`legacy authority decision ${name} checks every transitive diagnostic`, () => {
    assert.deepEqual(summarizeDiagnostics(diagnosticsForFixture(join(fixtureRoot, name))), []);
  });
}

test('legacy validator retains coercion, exact paths and live provenance observations', async () => {
  const { validateLegacyAuthorityDecision } = await import('../dist/prepare-legacy-ci-authority.mjs');
  const text = JSON.stringify({ decision: 'PASS', authorityFiles: ['docs/architecture.md'], extra: 42 });
  let reads = 0;
  const provenance = { get members() {
    reads += 1;
    return [{ path: 'docs/architecture.md' }];
  } };
  assert.deepEqual(validateLegacyAuthorityDecision({ toString: () => text }, provenance),
    { decision: 'PASS', authorityFiles: ['docs/architecture.md'], extra: 42 });
  assert.equal(reads, 2);
  for (const decision of [
    { decision: 'PASS', authorityFiles: ['other.md'] },
    { decision: 'PASS', authorityFiles: ['docs/architecture.md', 'docs/architecture.md'] },
    { decision: 'unsupported', authorityFiles: ['docs/architecture.md'] },
  ]) assert.throws(() => validateLegacyAuthorityDecision(JSON.stringify(decision), { members: [{ path: 'docs/architecture.md' }] }),
    /exact base-selected authorityFiles/);
});
