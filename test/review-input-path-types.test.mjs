import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/review-input-path-contract');
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
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const fixtureDiagnostics = diagnostics.filter(diagnostic => diagnostic.file?.fileName === file);
  const otherDiagnostics = diagnostics.filter(diagnostic => diagnostic.file?.fileName !== file);
  assert.deepEqual(otherDiagnostics, [], 'imports and authored declarations must be error-free');
  return fixtureDiagnostics;
}

function diagnosticEvidence(diagnostics) {
  return diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

test('review input paths accept Node path implementations and custom operations', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('review input paths reject wrong arguments, callbacks, and inferred output shape', () => {
  const diagnostics = diagnosticEvidence(diagnosticsFor('negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2554, 4], [2322, 5], [2322, 6], [2345, 7], [2345, 8], [2345, 9], [2345, 10], [2322, 11], [2322, 12], [2322, 13],
  ]);
  assert.match(diagnostics[0].message, /Expected 2-3 arguments/i);
  assert.match(diagnostics[1].message, /number.*string/i);
  assert.match(diagnostics[2].message, /string.*authenticated/i);
  assert.match(diagnostics[3].message, /number.*string/i);
  assert.match(diagnostics[4].message, /number.*string/i);
  assert.match(diagnostics[5].message, /number.*string/i);
  assert.match(diagnostics[6].message, /number.*string/i);
  assert.match(diagnostics[7].message, /Promise.*string/i);
  assert.match(diagnostics[8].message, /string.*boolean/i);
  assert.match(diagnostics[9].message, /number.*string/i);
});
