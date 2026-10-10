import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'tsconfig.json');
const fixtures = join(root, 'test', 'fixtures', 'review-context-contract');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(read.error, undefined, 'the adopted tsconfig must parse');
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, [], 'the adopted tsconfig must not contain errors');

function diagnosticsFor(name) {
  const file = join(fixtures, name);
  const program = ts.createProgram([file], { ...parsed.options, noEmit: true, rootDir: root });
  return ts.getPreEmitDiagnostics(program);
}

test('review input physical leaf and flat facade compose under strict project options', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('review input fixture rejects an invalid effective limit field', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.ok(diagnostics.length > 0, 'the invalid input must produce a compiler diagnostic');
  assert.ok(diagnostics.every(diagnostic => diagnostic.code === 2322),
    'only the intended string-to-number field mismatch is expected');
  assert.ok(diagnostics.every(diagnostic => diagnostic.file?.fileName.endsWith('/negative.mts')),
    'diagnostics must identify the intended negative fixture');
});
