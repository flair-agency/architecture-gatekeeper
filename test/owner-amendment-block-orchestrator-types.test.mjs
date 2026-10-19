import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-block-orchestrator-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined, 'the adopted tsconfig must parse');
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, [], 'the adopted tsconfig must be valid');
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.noEmitOnError, true);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'),
  join(fixtureRoot, 'negative.mts'),
], options, 'orchestrator source imports must remain error-free');

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  return diagnosticsForFixture(file);
}

test('BLOCK orchestrator callbacks and runtime-derived outputs have focused types', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('BLOCK orchestrator rejects wrong callback, config and external metadata assumptions', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]),
    [[2322, 4], [2322, 15], [2540, 17]]);
});
