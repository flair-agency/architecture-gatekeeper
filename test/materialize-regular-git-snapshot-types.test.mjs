import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/materialize-regular-git-snapshot-contract');
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
], compilerOptions, 'materializer and imported source contracts must remain error-free');

function diagnosticsFor(fixture) {
  const file = join(fixtureRoot, fixture);
  return diagnosticsForFixture(file);
}

test('materialized snapshot exposes only the observed path and computed digest contracts', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('materialized snapshot requires the accessed input fields and keeps observations unknown', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(diagnostic => [diagnostic.code,
    diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1]), [[2741, 6], [2322, 13], [2322, 15]]);
  const messages = diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  assert.match(messages[0], /outputPath.*missing/i);
  assert.match(messages[1], /unknown.*not assignable.*string/i);
  assert.match(messages[2], /string.*not assignable.*number/i);
});
