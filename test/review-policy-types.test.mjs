import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/review-policy-types-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'module contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('review contract keeps external decisions unknown and resolver output describes selected fields', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('review contract rejects treating an external decision as a trusted object', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [[2322, 5], [2322, 6], [2322, 9], [2322, 10]]);
  for (const diagnostic of diagnostics) {
    assert.match(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'), /unknown.*not assignable/i);
  }
});
