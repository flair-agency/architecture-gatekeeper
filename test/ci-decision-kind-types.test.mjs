import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-decision-kind-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsFor = compileFixtureDiagnostics(fixtureFiles, options, 'module contracts must remain error-free');

test('decision routing output remains unknown in the typed source contract', () => {
  const positive = fixtureFiles[0];
  const negative = fixtureFiles[1];
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor(positive)), []);
  const diagnostics = diagnosticsFor(negative);
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [[2322, 3]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /unknown.*not assignable/i);
});
