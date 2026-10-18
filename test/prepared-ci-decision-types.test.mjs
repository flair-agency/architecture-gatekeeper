import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/prepared-ci-decision-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined, 'the adopted tsconfig must parse');
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, [], 'the adopted tsconfig must not contain errors');
assert.equal(tsconfig.options.strict, true);
assert.equal(tsconfig.options.noImplicitAny, true);
assert.equal(tsconfig.options.noEmitOnError, true);
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };
const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFile = compileFixtureDiagnostics(fixtureFiles, compilerOptions, 'imports and declarations must be clean');
function diagnosticsFor(fixture) {
  return diagnosticsForFile(join(fixtureRoot, fixture));
}
function evidence(diagnostics) {
  return diagnostics.map(d => ({ code: d.code, line: d.file.getLineAndCharacterOfPosition(d.start).line + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }));
}
test('prepared CI decision accepts operational input and leaves parsed output unknown', () => assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []));
test('prepared CI decision rejects output trust, invalid fields, extra keys and wrong arity', () => {
  const diagnostics = evidence(diagnosticsFor('negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [[2322, 6], [2322, 7], [2741, 8], [2353, 9], [2554, 10], [2322, 11]]);
  assert.match(diagnostics[0].message, /unknown.*assignable/i);
});
