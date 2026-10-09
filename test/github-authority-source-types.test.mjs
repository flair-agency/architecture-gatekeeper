import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-authority-source-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'GitHub authority source module contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('GitHub authority source accepts standard fetch, sync, Promise and PromiseLike stream callbacks', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('GitHub authority source rejects invalid fetch callbacks and keeps captured input/result facts typed', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 3], [2322, 7], [2322, 9], [2322, 15], [2322, 16],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /GitHubAuthorityFetch/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /Buffer.*string|string.*Buffer/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /parameters.*url|number/s);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /string.*\(\) => GitHubAuthorityReader/s);
});
