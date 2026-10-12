import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-block-context-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'block context module contract must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('BLOCK context type contract retains unknown caller inputs and unknown tag object metadata', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('BLOCK context type contract rejects narrowed metadata, extra arguments, and wrong result types', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1,
    ts.flattenDiagnosticMessageText(item.messageText, '\n')]), [
    [2741, 6, "Property 'tagRef' is missing in type '{ headSha: string; tag: string; observedTagRefOid: string; reviewRecordBytes: string; amendmentRecordBytes: string; attestationBundleBytes: string; }' but required in type 'TagEnvelopeInput'."],
    [1360, 7, "Type 'unknown' does not satisfy the expected type 'number'."],
    [1360, 8, "Type 'unknown' does not satisfy the expected type 'string'."],
    [2554, 9, 'Expected 1 arguments, but got 2.'],
  ]);
});
