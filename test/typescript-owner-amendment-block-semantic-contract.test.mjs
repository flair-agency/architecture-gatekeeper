import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-block-semantic-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function fixtureDiagnostics(name) {
  const file = join(fixtureRoot, name);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'BLOCK semantic source imports must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('BLOCK semantic contract resolves both the flat facade and physical .mts implementation', () => {
  assert.deepEqual(fixtureDiagnostics('positive.mts'), []);
});

test('BLOCK semantic results do not assert authentication or validated external binding values', () => {
  const diagnostics = fixtureDiagnostics('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]),
    [[2741, 4], [2322, 5], [2322, 6]]);
});
