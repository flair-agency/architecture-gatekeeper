import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
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
  const file = join(fixtures, 'negative.mts');
  const source = readFileSync(file, 'utf8');
  const diagnostics = diagnosticsFor('negative.mts');
  const expected = [
    { needle: "maxFiles: 'many'", message: "Type 'string' is not assignable to type 'number'." },
    { needle: 'const observedLimit: number', message: "Type 'unknown' is not assignable to type 'number'." },
  ].map(({ needle, message }) => ({
    line: source.slice(0, source.indexOf(needle)).split('\n').length,
    code: 2322,
    message,
  }));
  assert.deepEqual(diagnostics.map(diagnostic => ({
    line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  })), expected, 'diagnostics must match the intended input and unknown reread failures');
});
