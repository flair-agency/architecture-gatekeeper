import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-record-builder-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file !== file), [], 'record-builder implementation must remain error-free');
  return diagnostics.filter(item => item.file === file);
}

test('BLOCK record builder types preserve computed bytes and unchecked scope observations', () => {
  assert.deepEqual(compile('positive.mts'), []);
});

test('BLOCK record builder contracts reject readonly and unknown-value overclaims', () => {
  const diagnostics = compile('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.line]), [
    [2540, 8], [2322, 9], [2322, 10],
  ]);
  assert.match(diagnostics[0].message, /read-only property/i);
  assert.match(diagnostics[1].message, /Buffer.*string|not assignable/i);
  assert.match(diagnostics[2].message, /unknown.*string|not assignable/i);
});
