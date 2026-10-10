import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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

function diagnosticsFor(fixture) {
  const file = join(fixtureRoot, fixture);
  const program = ts.createProgram([file], compilerOptions);
  return ts.getPreEmitDiagnostics(program).map(diagnostic => ({
    code: diagnostic.code,
    file: diagnostic.file?.fileName === file ? fixture : diagnostic.file?.fileName ?? null,
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
  const allDiagnostics = diagnosticsFor('negative.mts');
  const diagnostics = allDiagnostics.filter(diagnostic => diagnostic.file === 'negative.mts');
  assert.deepEqual(allDiagnostics, diagnostics, 'imports and authored declarations must be error-free');
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2322, 3], [2322, 4], [2322, 5], [2741, 6],
  ]);
  assert.match(diagnostics[0].message, /string.*number/i);
  assert.match(diagnostics[1].message, /boolean.*number/i);
  assert.match(diagnostics[2].message, /unknown.*number/i);
  assert.match(diagnostics[3].message, /Property 'valid' is missing in type '\{ type: string; \}'/);
});
