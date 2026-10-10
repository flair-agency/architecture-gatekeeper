import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/legacy-git-snapshot-contract');
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

test('legacy Git snapshots preserve the facade types and ordinary observation shape', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('legacy Git snapshots reject malformed selections and inferred claims', () => {
  const diagnostics = diagnosticEvidence(diagnosticsFor('negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2345, 3], [2322, 4], [2322, 5], [2322, 6], [2322, 7], [2741, 8], [2322, 9], [2322, 10],
  ]);
  assert.match(diagnostics[0].message, /Property 'path' is missing/i);
  for (const diagnostic of diagnostics.slice(1, 4)) assert.match(diagnostic.message, /number.*string/i);
  assert.match(diagnostics[4].message, /string.*number/i);
  assert.match(diagnostics[5].message, /authenticated.*missing/i);
  assert.match(diagnostics[6].message, /Buffer.*string/i);
  assert.match(diagnostics[7].message, /must be a type predicate/i);
});
