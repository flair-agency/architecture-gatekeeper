import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-owner-decision-record-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const formatDiagnostic = item => ({
  code: item.code,
  file: item.file?.fileName,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(formatDiagnostic), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const moduleDiagnostics = diagnostics.filter(item => item.file?.fileName !== file);
  assert.deepEqual(moduleDiagnostics.map(formatDiagnostic), [], 'OWNER_DECISION record module contract must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('OWNER_DECISION record contracts compose flat and physical builder/validator exports with unknown external data', () => {
  assert.deepEqual(diagnosticsFor('positive.mts').map(formatDiagnostic), []);
});

test('OWNER_DECISION record contracts require complete call inputs, readonly inputs, and unknown result observations', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2345, 14], [2345, 15], [2740, 16], [2740, 17], [2741, 19], [2741, 20],
    [2345, 22], [2540, 23], [2322, 24], [2322, 25], [2322, 26], [2322, 27], [2322, 28], [2322, 29],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /decisionBytes|context|authority/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /record|recordBytes|decisionBytes/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[6].messageText, '\n'), /authority.*missing|missing.*authority/i);
  for (const index of [8, 9, 10, 11, 12]) {
    assert.match(ts.flattenDiagnosticMessageText(diagnostics[index].messageText, '\n'), /unknown.*string|not assignable/i);
  }
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[13].messageText, '\n'), /unknown.*1|not assignable/i);
});
