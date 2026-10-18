import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/review-policy-types-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFile = compileFixtureDiagnostics(fixtureFiles, options, 'module contracts must remain error-free');

function diagnosticsFor(name) {
  return diagnosticsForFile(join(fixtureRoot, name));
}

test('review contract keeps external decisions unknown and resolver output describes selected fields', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('review contract rejects treating an external decision as a trusted object', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [[2322, 5], [2322, 6], [2322, 9], [2322, 10]]);
  for (const diagnostic of diagnostics) {
    assert.match(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'), /unknown.*not assignable/i);
  }
});
