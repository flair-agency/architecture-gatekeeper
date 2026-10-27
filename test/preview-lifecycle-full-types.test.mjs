import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';
import { parse } from 'acorn';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const fixtureRoot = join(root, 'test/fixtures/preview-lifecycle-contract');
const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFile = compileFixtureDiagnostics(fixtureFiles, { ...parsed.options, rootDir: root, noEmit: true }, 'imported lifecycle contracts remain error-free');
function diagnosticsFor(name) {
  return diagnosticsForFile(join(fixtureRoot, name)).map(item => ({ code: item.code,
    line: item.file.getLineAndCharacterOfPosition(item.start).line + 1,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }));
}
test('lifecycle APIs accept external JSON and preserve unverified states and unknown observations', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});
test('lifecycle APIs reject trusted observations, acceptance claims, missing operation inputs and invalid byte inputs', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2322, 5], [2322, 6], [2322, 8], [2322, 9], [2322, 10], [2322, 11], [2322, 12],
    [2554, 13], [2554, 14], [2554, 15], [2554, 16], [2345, 17], [2345, 18], [2345, 19],
  ]);
  for (const index of [0, 1, 2, 3, 6]) assert.match(diagnostics[index].message, /unknown/);
  assert.match(diagnostics[4].message, /PENDING.*ACCEPTED/);
  assert.match(diagnostics[5].message, /UNVERIFIED.*VERIFIED/);
});
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}
function body(source) { return canonical(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body); }
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('complete source and emitted lifecycle retain immutable f451c0c operations and flat identities', async () => {
  const file = join(root, 'src/preview-lifecycle-runtime.mts');
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: parsed.options, fileName: file });
  // f451c0c:src/preview-lifecycle.mts, all imports and runtime statements.
  const operationHash = '81e77354f66e85de0d5759c4c1882a8c0bb860523c10c779f8d8b11e79ac64ce';
  for (const source of [compiled.outputText, readFileSync(join(root, 'dist/preview-lifecycle-runtime.mjs'), 'utf8')]) {
    assert.equal(digest(body(source)), operationHash);
  }
  const expectedFacade = `export { PREVIEW_PROFILE, previewReceiptBytes, preparePreviewLifecycle,
    completePreviewLifecycle, validatePreviewReceipt, observePreviewLifecycle,
    prepareFreshPreviewReview } from './preview-lifecycle-runtime.mjs';`;
  assert.deepEqual(body(readFileSync(join(root, 'src/preview-lifecycle.mts'), 'utf8')
    .replace('./preview-lifecycle-runtime.mts', './preview-lifecycle-runtime.mjs')), body(expectedFacade));
  assert.deepEqual(body(readFileSync(join(root, 'dist/preview-lifecycle.mjs'), 'utf8')), body(expectedFacade));
  for (const layout of ['src', 'dist']) {
    const flat = await import(`../${layout}/preview-lifecycle.${layout === 'src' ? 'mts' : 'mjs'}`);
    const physical = await import(`../${layout}/preview-lifecycle-runtime.${layout === 'src' ? 'mts' : 'mjs'}`);
    assert.deepEqual(Object.keys(flat).sort(), Object.keys(physical).sort());
    for (const key of Object.keys(flat)) assert.equal(flat[key], physical[key]);
  }
});
