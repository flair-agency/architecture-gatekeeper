import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/typescript/tag-contracts');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'tag module imports must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('tag attempt contracts accept synchronous, async, thenable and unknown external values', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('tag contracts reject invalid callbacks, input/result assumptions and mutable states', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  const actual = diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]);
  assert.deepEqual(actual, [[2322, 4], [2322, 5], [2540, 8], [2322, 10], [2322, 14], [2322, 16]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /number.*not assignable|not assignable.*number/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /expectedUrl|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /read-only/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /string \| null/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[5].messageText, '\n'), /tagRef|attempted/);
});
