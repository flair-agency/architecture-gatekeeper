import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/protected-ci-input-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const format = item => ({
  code: item.code,
  file: item.file?.fileName.slice(root.length + 1),
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(format), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positiveFile, negativeFile], options));
const nonFixtureDiagnostics = diagnostics.filter(item => item.file?.fileName !== positiveFile && item.file?.fileName !== negativeFile);
assert.deepEqual(nonFixtureDiagnostics.map(format), [], 'input preparation and all transitive source dependencies must type-check');
const positiveDiagnostics = diagnostics.filter(item => item.file?.fileName === positiveFile);
const negativeDiagnostics = diagnostics.filter(item => item.file?.fileName === negativeFile);

test('protected and Gemini CI preparation expose usable selector, callback, and result contracts', () => {
  assert.deepEqual(positiveDiagnostics.map(format), []);
});

test('preparation contracts reject malformed snapshots and invalid callback parameters', () => {
  assert.deepEqual(negativeDiagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 6], [2345, 7], [2322, 9],
  ]);
});
