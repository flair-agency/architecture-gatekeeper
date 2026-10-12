import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-report-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  const brief = diagnostics.map(item => {
    const location = item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start) : null;
    return { code: item.code, file: item.file?.fileName.split('/').slice(-3).join('/'),
      line: location ? location.line + 1 : null,
      message: ts.flattenDiagnosticMessageText(item.messageText, ' ').slice(0, 180) };
  });
  assert.deepEqual(brief, [], 'CI report module and fixture types must compile');
  return diagnostics;
}

test('CI report public types distinguish successful decisions and optional provenance', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
  assert.deepEqual(diagnosticsFor('negative.mts'), []);
});
