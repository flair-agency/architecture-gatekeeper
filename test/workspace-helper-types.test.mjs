import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/workspace-helper-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined, 'the repository tsconfig must parse');
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, [], 'the repository tsconfig must be valid');
assert.equal(tsconfig.options.strict, true);
assert.equal(tsconfig.options.noImplicitAny, true);
assert.equal(tsconfig.options.noEmitOnError, true);
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };
const fixtureNames = ['physical-positive.mts', 'flat-positive.mts', 'physical-negative.mts', 'flat-negative.mts'];
const fixturePaths = new Set(fixtureNames.map(name => join(fixtureRoot, name)));
const program = ts.createProgram([...fixturePaths], compilerOptions);
const allDiagnostics = ts.getPreEmitDiagnostics(program);
const sharedDiagnostics = allDiagnostics.filter(item => !fixturePaths.has(item.file?.fileName));
assert.deepEqual(sharedDiagnostics, [], 'typed sources and flat compatibility exports must compile');

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  return allDiagnostics.filter(item => item.file?.fileName === file);
}

function summarize(diagnostics) {
  return diagnostics.map(item => ({
    code: item.code,
    line: item.file.getLineAndCharacterOfPosition(item.start).line + 1,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

test('workspace helpers accept unknown external inputs through typed leaves and flat facades', () => {
  assert.deepEqual(diagnosticsFor('physical-positive.mts'), []);
  assert.deepEqual(diagnosticsFor('flat-positive.mts'), []);
});

test('physical workspace helper outputs remain readonly and correctly typed', () => {
  const diagnostics = summarize(diagnosticsFor('physical-negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2322, 7], [2540, 8], [2540, 9], [2322, 10], [2322, 11],
  ]);
  assert.match(diagnostics[0].message, /Type 'string' is not assignable to type/);
  assert.match(diagnostics[1].message, /read-only property/);
  assert.match(diagnostics[2].message, /read-only property/);
  assert.match(diagnostics[3].message, /void.*string/);
  assert.match(diagnostics[4].message, /URL.*string/);
});

test('flat workspace helper outputs retain the same contracts', () => {
  const diagnostics = summarize(diagnosticsFor('flat-negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [[2322, 6]]);
  assert.match(diagnostics[0].message, /void.*string/);
});
