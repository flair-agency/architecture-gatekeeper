import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-block-semantic-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const diagnosticsFor = compileFixtureDiagnostics(
  ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name)),
  options, 'BLOCK semantic source imports must remain error-free',
);

test('BLOCK semantic contract resolves both the flat facade and physical .mts implementation', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor(join(fixtureRoot, 'positive.mts'))), []);
});

test('BLOCK semantic results do not assert authentication or validated external binding values', () => {
  const diagnostics = diagnosticsFor(join(fixtureRoot, 'negative.mts'));
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]),
    [[2741, 5], [2322, 6], [2322, 7]]);
});
