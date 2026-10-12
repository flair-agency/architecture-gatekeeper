import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/local-reviewer-execution-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positiveFile, negativeFile], options));
const summary = diagnostics.map(item => ({
  file: item.file?.fileName,
  code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
}));

test('local reviewer execution composes required requests, sync callbacks and async thenables', () => {
  assert.deepEqual(summary.filter(item => item.file === positiveFile), []);
});

test('local reviewer execution rejects missing deadlines, sync thenables and incomplete envelopes', () => {
  assert.deepEqual(summary.filter(item => item.file === negativeFile), []);
  assert.deepEqual(summary.filter(item => item.file !== positiveFile && item.file !== negativeFile), [],
    'transport implementation and transitive imports must remain error-free');
});
