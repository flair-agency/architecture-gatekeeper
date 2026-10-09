import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-leaf-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'GitHub leaf module contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('GitHub leaf contracts preserve unknown repository identities and accept Node execFileSync', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('GitHub leaf contracts reject incomplete expectations, narrowed output, and invalid runner arguments', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2345, 5], [2345, 6], [2345, 7], [2322, 10], [2345, 11], [2322, 12],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /repositoryId/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /parameter of type.*=> unknown/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /number/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /string/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[5].messageText, '\n'), /number.*string|string.*number/s);
});
