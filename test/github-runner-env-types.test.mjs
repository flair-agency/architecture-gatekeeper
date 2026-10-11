import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-runner-env-contract');
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

test('runner output path bridge has a zero-argument string contract under project settings', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('runner output path bridge rejects caller-selected arguments and incompatible return contracts', () => {
  const diagnostics = diagnosticEvidence(diagnosticsFor('negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [[2554, 3], [2322, 4], [2322, 5]]);
  assert.match(diagnostics[0].message, /Expected 0 arguments/i);
  assert.match(diagnostics[1].message, /string.*not assignable.*number/i);
  assert.match(diagnostics[2].message, /string.*not assignable.*undefined/i);
});
