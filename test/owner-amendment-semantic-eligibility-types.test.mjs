import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-semantic-eligibility-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const files = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
const relevant = diagnostics.map(item => ({ file: item.file?.fileName, line: item.file && item.start !== undefined
  ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined, code: item.code,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }));
const summary = items => items.map(({ file, line, code }) => [file && file.slice(root.length + 1), line, code]);

test('semantic eligibility producer accepts the explicit sync callback contract', () => {
  assert.deepEqual(summary(relevant.filter(item => item.file === files[0])), []);
});

test('semantic eligibility producer rejects async callbacks for synchronous collaborator operations', () => {
  const negative = relevant.filter(item => item.file === files[1]);
  assert.deepEqual(summary(negative), [[files[1].slice(root.length + 1), 8, 2740]]);
  assert.match(negative[0].message, /Promise/);
  assert.deepEqual(summary(relevant.filter(item => !files.includes(item.file))), [], 'implementation dependencies must remain error-free');
});
