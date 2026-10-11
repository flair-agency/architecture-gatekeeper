import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/runner-temp-path-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const compact = diagnostic => [diagnostic.code,
  diagnostic.file?.fileName.slice(root.length + 1),
  diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
  ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')];
assert.deepEqual(parsed.errors.map(compact), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positiveFile, negativeFile], options));
assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== positiveFile && item.file?.fileName !== negativeFile).map(compact), [],
  'runner temp path implementation and transitive imports must remain error-free');

test('runner temp path contracts retain path, Buffer, and unknown manifest observations', () => {
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName === positiveFile).map(compact), []);
});

test('runner temp path contracts reject incorrect output and validator-result assumptions', () => {
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName === negativeFile)
    .map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
      [2322, 8], [2322, 9], [2322, 10], [2322, 11],
    ]);
});
