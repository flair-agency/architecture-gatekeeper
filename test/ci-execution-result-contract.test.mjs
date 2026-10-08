import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-execution-result-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'module contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('execution result state contracts accept correctly narrowed completed and incomplete states', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('execution result state contracts require completed bytes and exclude them from incomplete states', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [
    item.code,
    item.file.getLineAndCharacterOfPosition(item.start).line + 1,
  ]), [[2339, 4], [2741, 6], [2353, 23], [2322, 25]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /responseBytes/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /responseBytes/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /responseBytes/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /unknown.*failure|not assignable/i);
});
