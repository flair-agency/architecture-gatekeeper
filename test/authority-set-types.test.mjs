import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/authority-set-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const program = ts.createProgram([positiveFile, negativeFile], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
const compact = diagnostics.map(item => ({
  file: item.file?.fileName,
  code: item.code,
  line: item.file?.getLineAndCharacterOfPosition(item.start).line + 1,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
}));
const implementationDiagnostics = diagnostics.filter(item => ![positiveFile, negativeFile].includes(item.file?.fileName));
assert.deepEqual(implementationDiagnostics.map(item => compact.find(value => value.file === item.file?.fileName && value.line === item.file.getLineAndCharacterOfPosition(item.start).line + 1 && value.code === item.code)), [],
  `authority-set and its transitive source imports must remain strict-clean: ${JSON.stringify(compact)}`);
const positiveDiagnostics = diagnostics.filter(item => item.file?.fileName === positiveFile);
const negativeDiagnostics = diagnostics.filter(item => item.file?.fileName === negativeFile);

test('authority-set contracts retain mutable construction, frozen limits, and sync/awaited adapter shapes', () => {
  assert.deepEqual(positiveDiagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), []);
});

test('authority-set contracts reject readonly-limit mutation, narrowed callbacks, async Git reads, and unsupported output claims', () => {
  assert.deepEqual(negativeDiagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2540, 14], [2741, 16], [2322, 19], [2322, 25], [2740, 28], [2322, 38],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[0].messageText, '\n'), /read.only|readonly/i);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[1].messageText, '\n'), /maxBytes/);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[2].messageText, '\n'), /not assignable|Promise/i);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[3].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[4].messageText, '\n'), /Buffer.*Promise|Promise.*Buffer/i);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[5].messageText, '\n'), /unknown.*number|not assignable/i);
});
