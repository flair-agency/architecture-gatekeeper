import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-enforced-acceptance-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.noEmitOnError, true);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const files = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
const summary = diagnostics.map(item => ({ file: item.file?.fileName, line: item.file && item.start !== undefined
  ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined, code: item.code,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }));
const compact = items => items.map(({ file, line, code }) => [file && file.slice(root.length + 1), line, code]);

test('enforced acceptance preserves the frozen ordinary route contract and accepts unknown environment observations', () => {
  assert.deepEqual(compact(summary.filter(item => item.file === files[0])), []);
});

test('enforced acceptance rejects missing mandatory observations, route mutation and unsupported routes', () => {
  const negative = summary.filter(item => item.file === files[1]);
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [
    [2554, 5], [2345, 7], [2345, 9], [2345, 11], [2554, 13], [2345, 15], [2540, 19], [2322, 21],
  ]);
  const messages = [/Expected 1 arguments/, /reviewResult, conclusion/, /conclusion.*missing/s,
    /reviewResult.*missing/s, /Expected 1 arguments/, /reviewResult, conclusion/,
    /route.*read.only/i, /owner-addition-pending.*blocked/s];
  negative.forEach((diagnostic, index) => assert.match(diagnostic.message, messages[index]));
  assert.deepEqual(compact(summary.filter(item => !files.includes(item.file))), [], 'implementation dependencies must remain error-free');
});
