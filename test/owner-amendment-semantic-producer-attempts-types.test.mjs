import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-semantic-producer-attempts-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file).map(compact), [], 'semantic producer attempts source contract must be error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('semantic producer attempts compose flat and physical exports with async callback forms and unknown observations', () => {
  assert.deepEqual(diagnosticsFor('positive.mts').map(compact), []);
});

test('semantic producer attempts require operation inputs and preserve readonly, unknown observations', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2345, 10], [2540, 12], [2540, 13], [2322, 14], [2322, 15], [2322, 16],
  ]);
  const messages = diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
  assert.match(messages[0], /repository|bBaseSha|listRuns|listJobs/);
  assert.match(messages[1], /read-only/i);
  assert.match(messages[2], /read-only/i);
  assert.match(messages[3], /unknown.*string|not assignable/i);
  assert.match(messages[4], /unknown.*boolean|not assignable/i);
  assert.match(messages[5], /page|not assignable|unknown/i);
});
