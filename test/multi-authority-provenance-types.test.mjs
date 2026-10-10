import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/multi-authority-provenance-contract');
const configPath = join(root, 'tsconfig.json');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(read.error, undefined);
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
assert.deepEqual(config.errors, []);
assert.equal(config.options.strict, true);
assert.equal(config.options.noImplicitAny, true);
assert.equal(config.options.noEmitOnError, true);
const options = { ...config.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], options);
  const all = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(all.filter(diagnostic => diagnostic.file?.fileName !== file), [], 'physical and facade imports must resolve cleanly');
  return all.filter(diagnostic => diagnostic.file?.fileName === file);
}

test('multi-authority provenance exposes operational types through flat and physical imports', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('multi-authority provenance rejects malformed constructor shape and unsupported claims', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.equal(diagnostics.length, 5);
  const messages = diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  assert.match(messages[0], /Expected 3 arguments, but got 2/);
  assert.match(messages[1], /number.*string/i);
  assert.match(messages[2], /string.*number/i);
  assert.match(messages[3], /accepted.*missing/i);
  assert.match(messages[4], /unknown.*MultiAuthorityProvenance/i);
});
