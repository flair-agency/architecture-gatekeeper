import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-attestation-contract');
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
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [], 'attestation contract module must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('attestation contracts accept unknown external verifier output and narrow success only', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('attestation contracts reject certification of unknown data, mutable success and incomplete digest access', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]),
    [[2322, 4], [2322, 6], [2540, 8], [2322, 9], [2322, 11]]);
  const messages = diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
  assert.match(messages[0], /unknown/);
  assert.match(messages[1], /unknown/);
  assert.match(messages[2], /read-only/);
  assert.match(messages[3], /undefined/);
  assert.match(messages[4], /recordSha256/);
});
