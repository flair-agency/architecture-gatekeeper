import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-procedural-acceptance-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined, 'the repository tsconfig must parse');
const config = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(config.errors, [], 'the repository compiler options must remain valid');
assert.equal(config.options.strict, true);
assert.equal(config.options.noImplicitAny, true);
assert.equal(config.options.noEmitOnError, true);
const options = { ...config.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'implementation imports and declarations must compile cleanly');

function diagnostics(fixture) {
  return diagnosticsForFixture(join(fixtureRoot, fixture));
}

test('procedural acceptance types accept both existing routes and flat facade callers', () => {
  assert.deepEqual(summarizeDiagnostics(diagnostics('positive.mts')), []);
});

test('procedural acceptance types require every core routing observation', () => {
  const negative = diagnostics('negative.mts');
  assert.deepEqual(negative.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [[2345, 4]]);
  assert.match(ts.flattenDiagnosticMessageText(negative[0].messageText, '\n'), /selectedAuthorityChanged.*missing/s);
});

test('flat entrypoint keeps its sole public export and exact CLI routing output', async () => {
  const flat = await import('../dist/ci-procedural-acceptance.mjs');
  const grouped = await import('../dist/ci-review/ci-procedural-acceptance.mjs');
  assert.deepEqual(Object.keys(flat), ['assertProceduralV5Acceptance']);
  assert.equal(flat.assertProceduralV5Acceptance, grouped.assertProceduralV5Acceptance);

  const cli = join(root, 'dist/ci-procedural-acceptance.mjs');
  const env = {
    ...process.env,
    POLICY_VERSION: '5',
    EVIDENCE_PRODUCER: 'github-actions',
    REVIEW_RESULT: 'success',
    CONCLUSION: 'PASS',
    SELECTED_AUTHORITY_CHANGED: 'false',
  };
  const ordinary = spawnSync(process.execPath, [cli], { encoding: 'utf8', env });
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(ordinary.stdout, 'Procedural v5 acceptance route: ordinary-pass\n');

  const blocked = spawnSync(process.execPath, [cli], { encoding: 'utf8', env: { ...env,
    SELECTED_AUTHORITY_CHANGED: 'true' } });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /selected authority requires successful OWNER_ADDITION/);
});
