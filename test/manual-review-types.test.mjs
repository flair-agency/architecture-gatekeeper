import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/manual-review-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positive = join(fixtureRoot, 'positive.mts');
const negative = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positive, negative], options));
const brief = diagnostics.map(diagnostic => ({ file: diagnostic.file?.fileName, code: diagnostic.code,
  line: diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') }));

test('manual review facade preserves its callable CLI input contract', () => {
  assert.deepEqual(brief.filter(item => item.file === positive), []);
});

test('manual review CLI rejects invalid argument shapes', () => {
  assert.deepEqual(brief.filter(item => item.file === negative), []);
  assert.deepEqual(brief.filter(item => item.file !== positive && item.file !== negative), [],
    'manual review grouped implementation and transitive declarations must remain strict-clean');
});
