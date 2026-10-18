import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/tag-readback-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFile = compileFixtureDiagnostics(fixtureFiles, options, 'tag readback module contracts must remain error-free');

function diagnosticsFor(name) {
  return diagnosticsForFile(join(fixtureRoot, name));
}

test('tag readback callbacks accept sync, async, thenable, and unknown JSON results', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('tag readback rejects malformed callback contracts and widened observation fields', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 5], [2322, 6], [2322, 7], [2322, 8], [2322, 9], [2740, 10],
    [2554, 11], [2554, 12], [2345, 13], [2345, 14],
    [2322, 17], [2322, 18], [2322, 19], [2540, 20],
  ]);
  for (const diagnostic of diagnostics.slice(0, 5)) assert.match(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'), /json|Buffer/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[5].messageText, '\n'), /OwnerAmendmentTagReadbackInput/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[6].messageText, '\n'), /Expected 1 arguments/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[7].messageText, '\n'), /Expected 1 arguments/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[8].messageText, '\n'), /repository|OwnerAmendmentTagReadbackInput/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[9].messageText, '\n'), /repository|OwnerAmendmentTagReadbackInput/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[10].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[11].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[12].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[13].messageText, '\n'), /read-only/);
});
