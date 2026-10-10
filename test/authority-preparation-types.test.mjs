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

test('authority preparation rejects malformed roots and treating external decision JSON as trusted', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.equal(diagnostics.length, 1);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /number.*string/i);
});
