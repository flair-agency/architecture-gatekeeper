import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-cli-session-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const compact = diagnostic => ({
  code: diagnostic.code,
  file: diagnostic.file?.fileName,
  line: diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(compact), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'Gemini CLI session implementation and imported source modules must type-check under project settings');

function diagnosticsFor(name) {
  return diagnosticsForFixture(join(fixtureRoot, name)).map(compact);
}

test('Gemini CLI session accepts typed packet, materializer limits, thinking branches, and both exports', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('Gemini CLI session requires selected inputs/options and preserves result and readonly contracts', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2554, 5], [2739, 6], [2741, 7], [2741, 8], [2741, 9], [2741, 10],
    [2322, 11], [2322, 12], [2322, 13], [2322, 14], [2322, 14],
    [2322, 15], [2322, 15], [2322, 16], [2540, 17], [2322, 20], [2322, 23],
  ]);
  assert.match(diagnostics[0].message, /Expected 1 arguments/);
  assert.match(diagnostics[1].message, /packet.*workspaceLimits.*workspaceParentDirectory.*processOptions/);
  assert.match(diagnostics[6].message, /workspaceDirectory|does not exist/i);
  assert.match(diagnostics[7].message, /thinkingLevel|thinkingBudget/);
  assert.match(diagnostics[9].message, /thinkingLevel|not assignable/i);
  assert.match(diagnostics[11].message, /thinkingLevel|not assignable/i);
  assert.match(diagnostics[13].message, /Promise.*number|not assignable/i);
  assert.match(diagnostics[14].message, /read-only property/);
});
