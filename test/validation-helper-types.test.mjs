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

const fixturePaths = {
  positive: join(fixtureRoot, 'positive.mts'),
  negative: join(fixtureRoot, 'negative.mts'),
};
const program = ts.createProgram(Object.values(fixturePaths), options);
const allDiagnostics = ts.getPreEmitDiagnostics(program);
function diagnosticsFor(name) {
  const file = fixturePaths[name];
  const other = allDiagnostics.filter(diagnostic => diagnostic.file?.fileName !== fixturePaths.positive &&
    diagnostic.file?.fileName !== fixturePaths.negative);
  assert.deepEqual(other, [], 'physical, facade, and shared imports must resolve cleanly');
  return allDiagnostics.filter(diagnostic => diagnostic.file?.fileName === file);
}

test('validation helpers expose descriptive input and identity types through both imports', () => {
  assert.deepEqual(diagnosticsFor('positive'), []);
});

test('validation helpers reject malformed typed calls and unsupported external narrowing', () => {
  const diagnostics = diagnosticsFor('negative');
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
