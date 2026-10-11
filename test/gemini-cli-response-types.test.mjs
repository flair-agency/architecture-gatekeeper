import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-cli-response-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const files = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
const compact = diagnostics.map(item => [item.file?.fileName.slice(root.length + 1), item.code,
  item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined]);

test('Gemini CLI response contracts accept direct flat/grouped composition with explicit limits', () => {
  assert.deepEqual(compact.filter(([file]) => file === files[0].slice(root.length + 1)), []);
});

test('Gemini CLI response contracts reject missing limits and unchecked output claims', () => {
  assert.deepEqual(compact.filter(([file]) => file === files[1].slice(root.length + 1)), []);
  assert.deepEqual(compact.filter(([file]) => file !== files[0].slice(root.length + 1) && file !== files[1].slice(root.length + 1)), [],
    'response implementation and transitive imports must remain error-free');
});
