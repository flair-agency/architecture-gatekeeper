import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/local-post-tool-screen-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positiveFile, negativeFile], options));
function fixtureDiagnostics(file) {
  const foreign = diagnostics.filter(item => item.file?.fileName !== file);
  assert.deepEqual(foreign.map(item => [item.code, item.file?.fileName,
    item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
    ts.flattenDiagnosticMessageText(item.messageText, '\n')]), [],
    'post-tool-screen implementation and its transitive contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file).map(item => ({
    code: item.code,
    line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

test('post-tool screen composes unknown hook input, flat facade and async reviewer controls', () => {
  assert.deepEqual(fixtureDiagnostics(positiveFile), []);
});

test('post-tool screen contracts reject mistyped option and incomplete async envelopes', () => {
  assert.deepEqual(fixtureDiagnostics(negativeFile), []);
});
