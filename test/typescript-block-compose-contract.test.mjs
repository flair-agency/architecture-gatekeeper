import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/block-compose-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const diagnosticsFor = compileFixtureDiagnostics(
  ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name)),
  options, 'compose dependencies must remain error-free',
);

test('BLOCK compose contract resolves flat and physical sources with compatible callbacks', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor(join(fixtureRoot, 'positive.mts'))), []);
});

test('BLOCK compose rejects mismatched builders, narrowed unchecked errors, and result mutation', () => {
  const diagnostics = diagnosticsFor(join(fixtureRoot, 'negative.mts'));
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]),
    [[2322, 4], [2322, 8], [2540, 10]]);
});
