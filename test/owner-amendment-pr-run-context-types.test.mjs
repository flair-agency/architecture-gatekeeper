import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-pr-run-context-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined, 'the adopted tsconfig must parse');
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, [], 'the adopted tsconfig must not contain errors');
assert.equal(tsconfig.options.strict, true);
assert.equal(tsconfig.options.noImplicitAny, true);
assert.equal(tsconfig.options.noEmitOnError, true);
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], compilerOptions, 'imports and authored declarations must be error-free');

function diagnosticsFor(fixture) {
  const file = join(fixtureRoot, fixture);
  return diagnosticsForFixture(file);
}

function diagnosticEvidence(diagnostics) {
  return diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

test('PR/run context accepts unknown input and sync, Promise, and Promise.resolve thenable fetches', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('PR/run context keeps repeated success observations unknown and excludes success fields from incomplete results', () => {
  const diagnostics = diagnosticEvidence(diagnosticsFor('negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [[2322, 5], [2322, 8]]);
  assert.match(diagnostics[0].message, /unknown.*string/i);
  assert.match(diagnostics[1].message, /baseSha/i);
});
