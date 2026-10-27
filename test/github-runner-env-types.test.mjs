import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';
import { parse } from 'acorn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-runner-env-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined, 'the adopted tsconfig must parse');
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, [], 'the adopted tsconfig must not contain errors');
assert.equal(tsconfig.options.strict, true);
assert.equal(tsconfig.options.noImplicitAny, true);
assert.equal(tsconfig.options.noEmitOnError, true);
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };

const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFixture = compileFixtureDiagnostics(fixtureFiles, compilerOptions,
  'imports and authored declarations must be error-free');

function diagnosticEvidence(diagnostics) {
  return diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

test('runner output path bridge has a zero-argument string contract under project settings', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsForFixture(join(fixtureRoot, 'positive.mts'))), []);
});

test('runner output path bridge rejects caller-selected arguments and incompatible return contracts', () => {
  const diagnostics = diagnosticEvidence(diagnosticsForFixture(join(fixtureRoot, 'negative.mts')));
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]),
    [[2554, 3], [2322, 4], [2322, 5], [2554, 9], [2322, 10], [2322, 11]]);
  for (const offset of [0, 3]) {
    assert.match(diagnostics[offset].message, /Expected 0 arguments/i);
    assert.match(diagnostics[offset + 1].message, /string.*not assignable.*number/i);
    assert.match(diagnostics[offset + 2].message, /string.*not assignable.*undefined/i);
  }
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}

function runtimeBody(text) {
  return canonical(parse(text, { ecmaVersion: 'latest', sourceType: 'module' }).body);
}

test('typed getter retains the complete original runtime operations behind the modeled flat wrapper', () => {
  const path = join(root, 'src/github/github-runner-env.mts');
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: tsconfig.options, fileName: path });
  // Baseline f9edd72:src/github-runner-env.mjs. Normalize only coordinates and
  // literal spelling, after erasing types; exports, all reads and checks remain.
  const baseline = 'ae7c44bc1042e5282df04a0a1c0e3a0de18983d854e5bcc732aa185c0d1005d8';
  for (const text of [compiled.outputText, readFileSync(join(root, 'dist/github/github-runner-env.mjs'), 'utf8')]) {
    assert.equal(createHash('sha256').update(JSON.stringify(runtimeBody(text))).digest('hex'), baseline);
  }
  const wrapper = "import { trustedGitHubOutputPath as readGitHubOutputPath } from './github/github-runner-env.mjs';\n" +
    'export function trustedGitHubOutputPath() { return readGitHubOutputPath(); }';
  assert.deepEqual(runtimeBody(readFileSync(join(root, 'src/github-runner-env.mts'), 'utf8')
    .replace("'./github/github-runner-env.mts'", "'./github/github-runner-env.mjs'")), runtimeBody(wrapper));
  assert.deepEqual(runtimeBody(readFileSync(join(root, 'dist/github-runner-env.mjs'), 'utf8')), runtimeBody(wrapper));
});
