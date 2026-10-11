import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-merge-group-ordinary-review-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function summarize(diagnostics) {
  return diagnostics.map(item => ({
    file: item.file?.fileName,
    line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : 0,
    code: item.code,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

function compile(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], options);
  const diagnostics = summarize(ts.getPreEmitDiagnostics(program));
  assert.deepEqual(diagnostics.filter(item => item.file !== file), [], 'ordinary-review module contract must remain error-free');
  return diagnostics.filter(item => item.file === file);
}

test('merge-group ordinary review types retain unknown tuple observations, computed bytes, and thenable fetch callbacks', () => {
  assert.deepEqual(compile('positive.mts'), []);
});

test('ordinary review contracts reject mutation and unknown-value narrowing', () => {
  const diagnostics = compile('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.line]), [
    [2322, 10], [2540, 11], [2540, 12], [2322, 13], [2740, 15],
  ]);
  assert.match(diagnostics[0].message, /unknown.*string|not assignable/i);
  assert.match(diagnostics[3].message, /unknown.*string|not assignable/i);
  assert.match(diagnostics[4].message, /Promise.*Buffer|not assignable/i);
});
