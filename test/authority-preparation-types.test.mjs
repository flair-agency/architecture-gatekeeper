import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/authority-preparation-types-contract');
const configPath = join(root, 'tsconfig.json');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(read.error, undefined, 'repository tsconfig must parse');
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
assert.deepEqual(config.errors, [], 'repository tsconfig must be valid');
assert.equal(config.options.strict, true);
assert.equal(config.options.noImplicitAny, true);
assert.equal(config.options.noEmitOnError, true);
const options = { ...config.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.filter(diagnostic => diagnostic.file?.fileName !== file), [], 'facades and grouped modules must resolve');
  return diagnostics.filter(diagnostic => diagnostic.file?.fileName === file);
}

test('authority preparation contracts accept existing generic inputs and returns', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('authority preparation rejects malformed inputs and narrowing unresolved generated member metadata', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  const diagnosticsByLine = new Map(diagnostics.map(diagnostic => [
    (diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line ?? -1) + 1,
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  ]));
  assert.equal(diagnostics.length, 4);
  assert.match(diagnosticsByLine.get(3), /number.*string/i, 'numeric selfRoot must be rejected');
  assert.match(diagnosticsByLine.get(4), /number.*string.*Buffer/i, 'numeric manifestBytes must be rejected');
  assert.match(diagnosticsByLine.get(6), /string.*number/i, 'generated digest must remain a string');
  assert.match(diagnosticsByLine.get(7), /unknown.*number/i, 'unresolved member byte length must remain unknown');
});
