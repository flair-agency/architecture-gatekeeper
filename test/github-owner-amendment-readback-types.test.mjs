import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-owner-amendment-readback-contract');
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

test('github-owner-amendment-readback positive contracts and direct callback composition compile with project settings', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('github-owner-amendment-readback rejects incompatible contracts at their intended fields', () => {
  const diagnostics = diagnosticEvidence(diagnosticsFor('negative.mts'));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [[2322, 4], [2540, 5], [2322, 6], [2322, 7], [2322, 9], [2322, 11]]);
  assert.match(diagnostics[0].message, /unknown.*string/i);
  assert.match(diagnostics[1].message, /authorityDigest.*read.only/i);
  assert.match(diagnostics[2].message, /parameters.*url|number/s);
  assert.match(diagnostics[3].message, /string.*\(\)/s);
  assert.match(diagnostics[4].message, /json/i);
  assert.match(diagnostics[5].message, /assurance/i);
});
