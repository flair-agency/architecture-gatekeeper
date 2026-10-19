import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-execution-result-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'module contracts must remain error-free');

function diagnosticsFor(name) {
  return diagnosticsForFixture(join(fixtureRoot, name));
}

test('execution result state contracts accept correctly narrowed completed and incomplete states', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('execution result state contracts require completed bytes and exclude them from incomplete states', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [
    item.code,
    item.file.getLineAndCharacterOfPosition(item.start).line + 1,
  ]), [
    [2322, 4], [2741, 6], [2322, 23], [2322, 25],
    [2322, 35], [2322, 36], [2322, 38], [2322, 39], [2322, 41], [2322, 42],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /responseBytes|undefined/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /responseBytes/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /undefined/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /unknown.*failure|not assignable/i);
  for (const diagnostic of diagnostics.slice(4)) {
    assert.match(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'), /not assignable/i);
    assert.match(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'), /responseBytes/);
  }
});
