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
    [2345, 11], [2554, 12], [2554, 13], [2540, 15], [2540, 16], [2322, 17], [2322, 18], [2322, 19],
  ]);
  const messages = diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
  assert.match(messages[0], /repository|bBaseSha|listRuns|listJobs/);
  assert.match(messages[1], /Expected 1 arguments/i);
  assert.match(messages[2], /Expected 1 arguments/i);
  assert.match(messages[3], /read-only/i);
  assert.match(messages[4], /read-only/i);
  assert.match(messages[5], /unknown.*string|not assignable/i);
  assert.match(messages[6], /unknown.*boolean|not assignable/i);
  assert.match(messages[7], /page|not assignable|unknown/i);
});
