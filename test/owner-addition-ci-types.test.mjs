import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-addition-ci-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const compact = diagnostic => ({
  code: diagnostic.code,
  file: diagnostic.file?.fileName,
  line: diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(compact), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  const other = diagnostics.filter(item => item.file?.fileName !== file);
  assert.deepEqual(other.map(compact), [], 'owner-addition CI source graph must type-check with project settings');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('owner-addition CI flat and grouped contracts accept process environments and validated policy output', () => {
  assert.deepEqual(diagnosticsFor('positive.mts').map(compact), []);
});

test('owner-addition CI keeps caller observations unknown and rejects invalid typed call inputs', () => {
  const diagnostics = diagnosticsFor('negative.mts').map(compact);
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2345, 6], [2345, 8], [2345, 10], [2345, 12], [2345, 14], [2345, 16],
    [2345, 18], [2345, 20], [2345, 22], [2322, 23], [2345, 24], [2345, 25],
    [2345, 26], [2322, 27], [2322, 28],
  ]);
  assert.match(diagnostics[0].message, /GITHUB_WORKSPACE.*GITHUB_REPOSITORY.*BASE_SHA/s);
  assert.match(diagnostics[1].message, /GITHUB_WORKSPACE/);
  assert.match(diagnostics[2].message, /GITHUB_REPOSITORY/);
  assert.match(diagnostics[3].message, /BASE_SHA/);
  assert.match(diagnostics[4].message, /HEAD_SHA/);
  assert.match(diagnostics[5].message, /BASE_BRANCH/);
  assert.match(diagnostics[6].message, /POLICY_PATH/);
  assert.match(diagnostics[7].message, /ORDINARY_SCHEMA_PATH/);
  assert.match(diagnostics[8].message, /OUTPUT_DIR/);
  assert.match(diagnostics[13].message, /unknown.*string|not assignable/i);
  assert.match(diagnostics[14].message, /unknown.*string|not assignable/i);
});
