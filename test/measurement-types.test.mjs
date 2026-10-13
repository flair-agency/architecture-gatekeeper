import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'tsconfig.json');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(read.error, undefined);
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
assert.deepEqual(config.errors, []);
const positive = join(root, 'test/fixtures/measurement-contract/positive.mts');
const negative = join(root, 'test/fixtures/measurement-contract/negative.mts');
const program = ts.createProgram([positive, negative], { ...config.options, rootDir: root, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);

test('measurement authored TypeScript composes public, CLI and local APIs with unknown external evidence', () => {
  assert.deepEqual(diagnostics.filter(d => d.file?.fileName !== negative), []);
});

test('measurement contracts reject malformed selections and unsupported parsed-data narrowing', () => {
  const actual = diagnostics.filter(d => d.file?.fileName === negative);
  assert.equal(actual.length, 7);
  for (const line of [5, 6, 7, 8, 9, 10, 11]) {
    const diagnostic = actual.find(d => d.file.getLineAndCharacterOfPosition(d.start).line + 1 === line);
    assert.ok(diagnostic, `missing expected error on line ${line}`);
    assert.equal(diagnostic.code, 2322);
  }
});
