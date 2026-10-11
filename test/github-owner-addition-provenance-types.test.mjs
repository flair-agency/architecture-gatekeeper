import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-owner-addition-provenance-contract');
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
  const summarize = item => ({
    file: item.file?.fileName,
    line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : 0,
    code: item.code,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  });
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file).map(summarize), [],
    'the implementation and every imported source module must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file).map(summarize);
}

test('GitHub owner-addition provenance accepts native, narrow partial, and thenable fetch implementations', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('GitHub owner-addition provenance keeps external observations unknown and requires the verification inputs', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.line]), [
    [2322, 9], [2322, 10], [2322, 11], [2345, 13], [2322, 15], [2322, 16], [2322, 17],
  ]);
  assert.match(diagnostics[0].message, /unknown.*string|not assignable/i);
  assert.match(diagnostics[1].message, /unknown.*repository|not assignable/i);
  assert.match(diagnostics[2].message, /string.*number|not assignable/i);
  assert.match(diagnostics[3].message, /githubToken|repository|not assignable/i);
  for (const diagnostic of diagnostics.slice(4)) assert.match(diagnostic.message, /unknown.*string|not assignable/i);
});
