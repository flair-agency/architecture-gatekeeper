import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-queue-context-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'queue context source contracts must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('queue context accepts sync, Promise, thenable and unknown JSON callback results', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('queue context rejects malformed callback contracts, stale incomplete shapes, and un-narrowed observations', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 6], [2322, 7], [2322, 8], [2322, 10], [2322, 12], [2322, 13], [2322, 14], [2322, 16],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /number.*string|string.*number/s);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /json|number.*not assignable/s);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /fetchImpl|number.*not assignable/s);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /runId/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /string.*number/s);
  for (const index of [5, 6, 7]) assert.match(ts.flattenDiagnosticMessageText(diagnostics[index].messageText, '\n'), /unknown.*string|not assignable/i);
});
