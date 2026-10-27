import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ordinary-gemini-adapter-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const diagnostics = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'ordinary Gemini adapter source graph must compile');
const compact = items => items.map(item => [item.code, item.file?.fileName.slice(root.length + 1), item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined]);

test('ordinary Gemini operations expose typed inputs and results across adapter boundaries', () => {
  assert.deepEqual(compact(diagnostics(join(fixtureRoot, 'positive.mts'))), []);
});

test('ordinary Gemini operations reject malformed static inputs', () => {
  const actual = compact(diagnostics(join(fixtureRoot, 'negative.mts')));
  assert.deepEqual(actual.map(([code, , line]) => [code, line]), [[2740, 4], [2322, 4], [2322, 4], [2739, 6], [2322, 8], [2322, 9]]);
  const messages = diagnostics(join(fixtureRoot, 'negative.mts')).map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
  assert.match(messages[0], /root|repository/);
  assert.match(messages[1], /number.*string/);
  assert.match(messages[2], /boolean.*string/);
  assert.match(messages[3], /context|runtime/);
  assert.match(messages[4], /number.*string/);
  assert.match(messages[5], /string.*Buffer/);
});
