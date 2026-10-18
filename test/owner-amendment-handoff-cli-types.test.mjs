import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-handoff-cli-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function summarize(diagnostics) {
  return diagnostics.map(item => ({
    file: item.file?.fileName,
    line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : 0,
    code: item.code,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'handoff CLI module contract must remain error-free');

test('flat source facade import is inert and retains the original direct-run dispatch guard', async () => {
  const facade = join(root, 'src/owner-amendment-handoff-cli.mjs');
  const imported = await import(facade);
  assert.equal(typeof imported.runOwnerAmendmentHandoff, 'function');
  const source = readFileSync(facade, 'utf8');
  assert.match(source, /if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{/);
  assert.match(source, /runOwnerAmendmentHandoff\(\)\.then\(result => \{/);
  assert.match(source, /process\.stdout\.write\(`\$\{JSON\.stringify\(result\)\}\\n`\);/);
  assert.match(source, /if \(result\.status !== 'TAG_TRANSPORTED_AND_READ_BACK'\) process\.exitCode = 1;/);
});

test('handoff CLI facade composes standard fetch and synchronous Git execution under the actual tsconfig', () => {
  const fixture = join(fixtureRoot, 'positive.mts');
  const diagnostics = summarize(diagnosticsForFixture(fixture));
  assert.deepEqual(diagnostics, []);
});

test('handoff CLI rejects asynchronous Git, incomplete selected contexts, invalid clocks, narrowed unknown reason and result mutation', () => {
  const fixture = join(fixtureRoot, 'negative.mts');
  const own = summarize(diagnosticsForFixture(fixture));
  assert.deepEqual(own.map(item => [item.code, item.line]), [
    [2322, 11], [2322, 12], [2322, 13], [2322, 17], [2540, 18],
  ]);
  assert.match(own[0].message, /Promise.*not assignable|not assignable.*Promise/i);
  assert.match(own[1].message, /runId|repository|baseSha/i);
  assert.match(own[3].message, /unknown.*string|not assignable/i);
});
