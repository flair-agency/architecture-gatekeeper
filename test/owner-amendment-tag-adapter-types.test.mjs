import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-tag-adapter-contract');
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

test('owner-amendment tag adapter positive callback and result contracts compile', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('owner-amendment tag adapters reject missing required inputs, wrong callbacks, mutable or trusted observations', () => {
  const diagnostics = diagnosticEvidence(diagnosticsFor('negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2345, 8], [2322, 9], [2322, 10], [2554, 11], [2554, 12], [2345, 13], [2345, 14],
    [2345, 27], [2345, 28], [2345, 29], [2345, 30], [2345, 31], [2345, 32], [2345, 33],
    [2345, 34], [2345, 35], [2345, 36], [2345, 37], [2345, 38], [2345, 39], [2345, 40],
    [2322, 41], [2322, 42], [2540, 44], [18046, 45], [2322, 46],
  ]);
  assert.match(diagnostics[0].message, /repository/i);
  assert.match(diagnostics[1].message, /undefined.*string/i);
  assert.match(diagnostics[2].message, /undefined.*Readonly/i);
  assert.match(diagnostics[3].message, /Expected 1 arguments/i);
  assert.match(diagnostics[4].message, /Expected 1 arguments/i);
  for (const diagnostic of diagnostics.slice(5, 21)) assert.match(diagnostic.message, /OwnerAmendmentTagAttemptInput|repository|baseSha|readTagRef/i);
  assert.match(diagnostics[21].message, /string.*PromiseLike/i);
  assert.match(diagnostics[22].message, /\(\) => unknown/i);
  assert.match(diagnostics[23].message, /read.only/i);
  assert.match(diagnostics[24].message, /unknown/i);
  assert.match(diagnostics[25].message, /unknown.*authenticated/i);
});
