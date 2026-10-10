import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/validation-helper-contract');
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

test('validation helpers expose descriptive input and identity types through both imports', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('validation helpers reject malformed typed calls and unsupported external narrowing', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.equal(diagnostics.length, 3);
  const intended = [
    { line: 6, code: 2322, message: /unknown.*decision/i },
    { line: 7, code: 2322, message: /unknown.*decision/i },
    { line: 8, code: 2322, message: /unknown.*type.*object/i },
  ];
  for (const expected of intended) {
    const diagnostic = diagnostics.find(item => item.file.getLineAndCharacterOfPosition(item.start).line + 1 === expected.line);
    assert.ok(diagnostic, `expected diagnostic on negative fixture line ${expected.line}`);
    assert.equal(diagnostic.code, expected.code);
    assert.match(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'), expected.message);
  }
});
