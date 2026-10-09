import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-git-changes-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'Git change module contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('Git change contracts expose readonly results and synchronous Buffer adapters', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('Git change contracts require complete inputs, synchronous callbacks, and readonly result shapes', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2345, 9], [2540, 11], [2540, 13], [2345, 14], [2540, 15], [2322, 16], [2740, 19], [2322, 21], [2740, 22], [2322, 23],
    [2345, 24], [2345, 25], [2345, 26], [2345, 27],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /Argument of type '\{\}' is not assignable/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /members/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[6].messageText, '\n'), /Promise.*Buffer|Promise.*not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[7].messageText, '\n'), /unsupported.*OwnerAmendmentGitProfile|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[8].messageText, '\n'), /Promise.*Buffer|Promise.*not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[9].messageText, '\n'), /unknown.*string|string.*unknown|not assignable/i);
  for (const index of [10, 11]) assert.match(ts.flattenDiagnosticMessageText(diagnostics[index].messageText, '\n'), /selectedAuthorityBytes/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[12].messageText, '\n'), /changedFiles/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[13].messageText, '\n'), /authorityChanges/);
});
