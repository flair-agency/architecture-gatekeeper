import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-owner-addition-evidence-zip-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'evidence ZIP helper must remain transitively error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('evidence ZIP helper accepts external unknown bytes and returns owned Buffer bytes', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('evidence ZIP helper output is not exposed as text', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => item.code), [2322]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /Buffer.*string|not assignable/i);
});
