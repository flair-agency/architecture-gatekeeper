import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-handoff-git-context-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'),
  join(fixtureRoot, 'negative.mts'),
], options, 'handoff Git context module contract must remain error-free');

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  return diagnosticsForFixture(file);
}

test('handoff Git context exposes copied mutable Buffer bytes and composes with Git change derivation', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('handoff Git context rejects missing required inputs, Promise Git adapters, and readonly mutation', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2345, 7], [2345, 8], [2339, 10], [2540, 11], [2542, 12], [2540, 13], [2322, 14], [2322, 16], [2322, 19],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /baseSha/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /runGit/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[6].messageText, '\n'), /unknown.*string|not assignable/i);
  for (const index of [7, 8]) assert.match(ts.flattenDiagnosticMessageText(diagnostics[index].messageText, '\n'), /Promise.*Buffer|Promise.*not assignable/i);
});
