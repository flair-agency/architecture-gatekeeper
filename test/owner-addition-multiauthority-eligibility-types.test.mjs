import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-addition-multiauthority-eligibility-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  return diagnostics.map(diagnostic => ({ file: diagnostic.file?.fileName, code: diagnostic.code,
    line: diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') }));
}

test('multi-authority eligibility stays unknown through grouped and flat exports', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('multi-authority eligibility rejects missing inputs and false semantic output claims', () => {
  assert.deepEqual(diagnosticsFor('negative.mts'), []);
});
