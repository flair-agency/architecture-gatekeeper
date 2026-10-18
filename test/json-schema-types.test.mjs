import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/json-schema-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined, 'the adopted tsconfig must parse');
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, [], 'the adopted tsconfig must not contain errors');
assert.equal(tsconfig.options.strict, true);
assert.equal(tsconfig.options.noImplicitAny, true);
assert.equal(tsconfig.options.noEmitOnError, true);
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };

const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFixture = compileFixtureDiagnostics(fixtureFiles, compilerOptions,
  'imports and authored declarations must be error-free');

function diagnosticsFor(fixture) {
  const file = join(fixtureRoot, fixture);
  return diagnosticsForFixture(file).map(diagnostic => ({
    code: diagnostic.code,
    file: fixture,
    line: diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
      : null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

test('JSON Schema validator preserves caller input types without inferring schema validity', () => {
  const diagnostics = diagnosticsFor('positive.mts');
  assert.deepEqual(diagnostics, [], 'imports and authored declarations must be error-free');
});

test('JSON Schema validator rejects invalid options and schema-derived claims', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2322, 3], [2322, 4], [2322, 5], [2741, 6],
  ]);
  assert.match(diagnostics[0].message, /string.*number/i);
  assert.match(diagnostics[1].message, /boolean.*number/i);
  assert.match(diagnostics[2].message, /unknown.*number/i);
  assert.match(diagnostics[3].message, /Property 'valid' is missing in type '\{ type: string; \}'/);
});
