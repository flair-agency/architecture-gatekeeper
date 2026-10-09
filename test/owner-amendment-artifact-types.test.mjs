import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-artifact-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'artifact module contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('artifact fetch callbacks accept sync, async, thenable and unknown JSON values', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('artifact contracts reject invalid callback inputs/payloads, stale result shapes, and narrowed external fields', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 3], [2322, 4], [2322, 6], [2322, 7], [2322, 10], [2322, 11], [2322, 12], [2322, 13],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /number.*string|string.*number/s);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /number.*not assignable|not assignable.*number/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /artifactName/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /expiresAt/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[7].messageText, '\n'), /unknown.*string|not assignable/i);
});
