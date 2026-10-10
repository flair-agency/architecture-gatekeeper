import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'tsconfig.json');
const fixtures = join(root, 'test', 'fixtures', 'review-context-contract');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(read.error, undefined, 'the adopted tsconfig must parse');
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, [], 'the adopted tsconfig must not contain errors');

const positiveFixture = join(fixtures, 'positive.mts');
const negativeFixture = join(fixtures, 'negative.mts');
const fixtureProgram = ts.createProgram([positiveFixture, negativeFixture], {
  ...parsed.options, noEmit: true, rootDir: root,
});
const fixtureDiagnostics = ts.getPreEmitDiagnostics(fixtureProgram);
const diagnosticsFor = file => fixtureDiagnostics.filter(diagnostic => diagnostic.file?.fileName === file);

test('review input physical leaf and flat facade compose under strict project options', () => {
  const knownFixtures = new Set([positiveFixture, negativeFixture]);
  assert.ok(fixtureDiagnostics.every(diagnostic => knownFixtures.has(diagnostic.file?.fileName)),
    'all fixture diagnostics must be owned by one of the two fixtures');
  assert.deepEqual(diagnosticsFor(positiveFixture), []);
});

test('review input fixture rejects an invalid effective limit field', () => {
  const file = negativeFixture;
  const source = readFileSync(file, 'utf8');
  const diagnostics = diagnosticsFor(negativeFixture);
  const expected = [
    { needle: "maxFiles: 'many'", message: "Type 'string' is not assignable to type 'number'." },
    { needle: 'const observedLimit: number', message: "Type 'unknown' is not assignable to type 'number'." },
  ].map(({ needle, message }) => ({
    line: source.slice(0, source.indexOf(needle)).split('\n').length,
    code: 2322,
    message,
  }));
  assert.deepEqual(diagnostics.map(diagnostic => ({
    line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  })), expected, 'diagnostics must match the intended input and unknown reread failures');
});
