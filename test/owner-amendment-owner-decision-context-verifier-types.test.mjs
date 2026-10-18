import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-owner-decision-context-verifier-contract');
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
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'OWNER_DECISION context verifier module contract must remain error-free');

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  return diagnosticsForFixture(file);
}

test('OWNER_DECISION context verifier composes the facade and physical module with unknown observations', () => {
  assert.deepEqual(diagnosticsFor('positive.mts').map(formatDiagnostic), []);
});

test('OWNER_DECISION context verifier exposes incomplete/verified results without promising string observations or mutability', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 7], [2339, 8],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /push|readonly/i);
});
