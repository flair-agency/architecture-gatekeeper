import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-leaf-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'GitHub leaf module contracts must remain error-free');

function diagnosticsFor(name) {
  return diagnosticsForFixture(join(fixtureRoot, name));
}

test('GitHub leaf contracts preserve unknown repository identities and accept Node execFileSync', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('GitHub leaf contracts reject incomplete expectations, narrowed output, and invalid runner arguments', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2345, 5], [2345, 6], [2345, 7], [2322, 10], [2345, 11], [2345, 12], [2322, 13],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /repositoryId/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /parameter of type.*=> unknown/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /number/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /string/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[5].messageText, '\n'), /readonly unknown\[\]/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[6].messageText, '\n'), /string.*number/);
});
