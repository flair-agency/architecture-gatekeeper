import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-merge-group-acceptance-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const formatDiagnostic = item => ({
  code: item.code,
  file: item.file?.fileName,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(formatDiagnostic), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'),
  join(fixtureRoot, 'missing-adapters.mts'),
  join(fixtureRoot, 'negative.mts'),
], options, 'acceptance verifier and every imported source module must remain error-free');

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  return diagnosticsForFixture(file);
}

test('acceptance verifier exposes typed async verification and readonly sync/thenable adapter boundaries', () => {
  assert.deepEqual(diagnosticsFor('positive.mts').map(formatDiagnostic), []);
});

test('acceptance verifier requires every constructor dependency and runtime identity', () => {
  assert.deepEqual(diagnosticsFor('missing-adapters.mts').map(formatDiagnostic), []);
});

test('acceptance result distinguishes the verifier state, unknown external observations, and incomplete values', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 10], [2322, 13], [2322, 14], [2540, 15], [2322, 20], [2322, 21],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /unknown.*array|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /read.only/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[5].messageText, '\n'), /undefined.*string|not assignable/i);
});
