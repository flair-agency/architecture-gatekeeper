import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-cli-proxy-session-contract');
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
    'the proxy-session implementation and every imported source module must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file).map(summarize);
}

test('Gemini proxy-session contract accepts complete mandatory input through grouped and flat exports', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('Gemini proxy-session contract rejects missing input, unsupported credentials/options, and wrong results', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.line]), [
    [2554, 5], [2322, 6], [2322, 7], [2322, 9], [2322, 11],
    [2322, 15], [2322, 18], [2322, 18], [2322, 21], [2322, 21],
  ]);
  assert.match(diagnostics[0].message, /Expected 1 arguments/);
  assert.match(diagnostics[1].message, /bearer|not assignable/i);
  assert.match(diagnostics[2].message, /proxyUrl|does not exist/i);
  assert.match(diagnostics[3].message, /Promise.*number|not assignable/i);
  assert.match(diagnostics[4].message, /thinkingBudget|thinkingLevel|not assignable/i);
  assert.match(diagnostics[5].message, /undefined|thinkingLevel/);
  assert.match(diagnostics[6].message, /undefined|thinkingBudget/);
  assert.match(diagnostics[7].message, /thinkingLevel|not assignable/i);
  assert.match(diagnostics[8].message, /thinkingBudget|not assignable/i);
  assert.match(diagnostics[9].message, /thinkingLevel|not assignable/i);
});
