import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/single-authority-member-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(fixture) {
  const file = join(fixtureRoot, fixture);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  const summary = diagnostics.map(diagnostic => ({
    file: diagnostic.file?.fileName,
    line: diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
  assert.deepEqual(summary, [], `${fixture} and its transitive imports must type-check`);
}

test('single-member selector composes with the existing manifest parser', () => {
  diagnosticsFor('positive.mts');
});

test('single-member selector requires parsed input and exposes only the checked ID string', () => {
  diagnosticsFor('negative.mts');
});
