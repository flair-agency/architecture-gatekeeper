import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-artifact-zip-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFixture = compileFixtureDiagnostics(fixtureFiles, options,
  'artifact ZIP module contract must remain error-free');

function diagnosticsFor(name) {
  return diagnosticsForFixture(join(fixtureRoot, name));
}

test('artifact ZIP contract accepts unknown input bytes and profile values while narrowing extracted bytes', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('artifact ZIP contract rejects unknown error messages as strings and contradictory result shapes', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 4], [2322, 11], [2322, 15],
  ]);
  const messages = diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
  assert.match(messages[0], /unknown.*string|not assignable/i);
  assert.match(messages[1], /undefined.*Buffer|not assignable/i);
  assert.match(messages[2], /reviewRecordBytes|not assignable/i);
});
