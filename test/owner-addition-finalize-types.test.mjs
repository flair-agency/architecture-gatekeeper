import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-addition-finalize-types');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined, 'the repository tsconfig must parse');
const config = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(config.errors, [], 'the repository compiler options must remain valid');
assert.equal(config.options.strict, true);
assert.equal(config.options.noImplicitAny, true);
assert.equal(config.options.noEmitOnError, true);
const options = { ...config.options, rootDir: root, noEmit: true };

function diagnostics(fixture) {
  const file = join(fixtureRoot, fixture);
  const program = ts.createProgram([file], options);
  const all = ts.getPreEmitDiagnostics(program);
  const local = all.filter(item => item.file?.fileName === file);
  const imported = all.filter(item => item.file?.fileName !== file);
  assert.deepEqual(imported, [], 'the implementation and its imported declarations must compile cleanly');
  return local;
}

test('owner addition final record accepts complete operational input and preserves lifecycle result states', () => {
  assert.deepEqual(diagnostics('positive.mts'), []);
});

test('owner addition final record requires operational input and leaves copied values unknown', () => {
  const negative = diagnostics('negative.mts');
  assert.deepEqual(negative.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2345, 4], [2322, 8], [2322, 11], [2322, 13], [2322, 17],
  ]);
  const messages = negative.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
  assert.match(messages[0], /OwnerAdditionFinalRecordInput.*missing/s);
  messages.slice(1).forEach(message => assert.match(message, /unknown.*string/s));
});
