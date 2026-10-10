import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-execution-observation-contract');
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

test('observation runners accept Node streams and operation-compatible duck-typed streams', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('observation runner rejects an input without the required stream operations', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [
    item.code,
    item.file.getLineAndCharacterOfPosition(item.start).line + 1,
  ]), [[2322, 3], [2741, 4], [2741, 5]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /AsyncIterable|destroy/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /write/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /write/);
});
