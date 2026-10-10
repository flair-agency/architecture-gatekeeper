import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-block-evidence-types');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined, 'the adopted tsconfig must parse');
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, [], 'the adopted tsconfig must not contain errors');
assert.equal(tsconfig.options.strict, true, 'the adopted tsconfig must keep strict mode');
assert.equal(tsconfig.options.noImplicitAny, true, 'the adopted tsconfig must keep noImplicitAny');
assert.equal(tsconfig.options.noEmitOnError, true, 'the adopted tsconfig must prevent emission after errors');
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };

function fixtureDiagnostics(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], { ...compilerOptions, rootDir: root });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const local = diagnostics.filter(item => item.file?.fileName === file);
  const imported = diagnostics.filter(item => item.file?.fileName !== file);
  assert.deepEqual(imported, [], 'source imports and declarations must be error-free');
  return local;
}

test('BLOCK evidence composer accepts unknown external fields and composes through the flat facade', () => {
  assert.deepEqual(fixtureDiagnostics('positive.mts'), []);
});

test('BLOCK evidence composer rejects an invalid gh callback', () => {
  const diagnostics = fixtureDiagnostics('negative-arguments.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [[2322, 4]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /Type 'string' is not assignable to type 'OwnerAmendmentGhRunner'/);
});

test('BLOCK evidence composer rejects a missing required inline envelope field', () => {
  const diagnostics = fixtureDiagnostics('negative-missing-envelope-field.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [[2741, 4]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /Property 'tagRef' is missing in type/);
});

test('BLOCK evidence result narrows incomplete and verified states', () => {
  const diagnostics = fixtureDiagnostics('negative-result-state.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [[2339, 6]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /reviewRecordSha256/);
});

test('BLOCK evidence leaves context and producer rereads unknown and input readonly', () => {
  const diagnostics = fixtureDiagnostics('negative-unknown-values.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]),
    [[2322, 6], [2322, 7], [2540, 10]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /Type 'unknown' is not assignable to type 'string'/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /read-only property/);
});
