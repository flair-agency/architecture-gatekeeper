import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-ruleset-readback-cli-contract');
const configPath = join(root, 'tsconfig.json');
const flatPath = join(root, 'src/github-ruleset-readback-cli.mjs');
const groupedPath = join(root, 'src/github/github-ruleset-readback-cli.mts');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positiveFile, negativeFile], options));
const summary = diagnostics.map(item => ({
  file: item.file?.fileName,
  code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
}));

test('ruleset readback CLI preserves the side-effect facade and producer composition types', () => {
  assert.deepEqual(summary.filter(item => item.file === positiveFile), []);
  const source = ts.createSourceFile(flatPath, ts.sys.readFile(flatPath), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(source.statements.length, 1);
  assert.ok(ts.isImportDeclaration(source.statements[0]));
  assert.equal(source.statements[0].moduleSpecifier.text, './github/github-ruleset-readback-cli.mts');
  const implementation = ts.createSourceFile(groupedPath, ts.sys.readFile(groupedPath), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.ok(implementation.statements.some(ts.isTryStatement));
  assert.equal(implementation.statements.some(ts.isIfStatement), false,
    'the relocated process entrypoint remains intentionally unguarded');
});

test('ruleset readback CLI fixtures reject unsupported producer callback shapes only', () => {
  assert.deepEqual(summary.filter(item => item.file === negativeFile), []);
  assert.deepEqual(summary.filter(item => item.file !== positiveFile && item.file !== negativeFile), [],
    'the CLI implementation and transitive imports must remain error-free');
});
