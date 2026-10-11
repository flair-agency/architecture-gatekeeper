import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-merge-group-evidence-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const compact = item => ({
  code: item.code,
  file: item.file?.fileName,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(compact), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file).map(compact), [], 'merge-group evidence module contract must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('merge-group evidence composes flat and physical exports, unknown observations, fetch and callback forms', () => {
  assert.deepEqual(diagnosticsFor('positive.mts').map(compact), []);
});

test('merge-group evidence states reject mutable, narrowed and incorrectly typed observations', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 10], [2322, 11], [2540, 13], [2322, 14], [2322, 15], [2322, 16],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /SynchronousGitCommand|not assignable|unknown/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /read-only/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /unknown.*VERIFIED|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /status|not assignable/i);
});
