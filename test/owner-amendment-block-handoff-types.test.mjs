import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'test/fixtures/owner-amendment-block-handoff-contract');
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
  const file = join(fixtures, name);
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.filter(diagnostic => diagnostic.file?.fileName !== file), [], 'facade and grouped module must resolve');
  return diagnostics.filter(diagnostic => diagnostic.file?.fileName === file);
}

test('BLOCK handoff facade preserves generic B, provenance and generated result types', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('BLOCK handoff rejects narrowed generated values, frozen outer writes, and incomplete expected context', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  const byLine = new Map(diagnostics.map(diagnostic => [
    (diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line ?? -1) + 1,
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  ]));
  assert.equal(diagnostics.length, 7);
  assert.match(byLine.get(9), /string.*number/i, 'tag message must be generated as text');
  assert.match(byLine.get(10), /string.*number/i, 'generated digest must be a string');
  assert.match(byLine.get(11), /missingField/i, 'caller provenance shape must be preserved');
  assert.match(byLine.get(12), /unknown.*string/i, 'Buffer base64 conversion remains caller-owned unchecked output');
  assert.match(byLine.get(13), /read-only property/i, 'only the outer frozen result is readonly');
  assert.match(byLine.get(14), /read-only property/i, 'the frozen result cannot replace its mutable envelope');
  assert.match(byLine.get(17), /workflowSha.*workflowPath.*runId.*runAttempt/i, 'expected context must provide every accessed field');
});
