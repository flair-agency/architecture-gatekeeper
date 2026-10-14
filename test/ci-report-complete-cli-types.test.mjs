import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.noEmitOnError, true);
const fixture = join(root, 'test/fixtures/ci-report-complete-cli-contract');
const positive = join(fixture, 'positive.mts');
const negative = join(fixture, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positive, negative], {
  ...parsed.options, rootDir: root, noEmit: true,
})).map(item => ({ file: item.file?.fileName, code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }));

test('complete report CLI accepts native, sync, async and thenable transport with unknown observations', () => {
  assert.deepEqual(diagnostics.filter(item => item.file === positive), []);
});

test('complete report CLI rejects invalid callbacks/completion and narrowed observations without hiding implementation diagnostics', () => {
  assert.deepEqual(diagnostics.filter(item => item.file !== negative && item.file !== positive), [],
    'unexpected implementation and transitive diagnostics must fail');
  const local = diagnostics.filter(item => item.file === negative);
  assert.deepEqual(local.map(({code, line}) => [code, line]), [
    [2345, 4], [2345, 5], [2322, 6], [2322, 7], [2322, 8], [2322, 9], [2554, 10], [2322, 11],
  ]);
  assert.match(local[2].message, /Promise<void>.*Promise<string>/s);
  assert.match(local[5].message, /unknown.*string/s);
});
