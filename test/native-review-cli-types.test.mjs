import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/native-review-cli-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positiveFile, negativeFile], options));
const summary = diagnostics.map(item => ({
  file: item.file?.fileName,
  code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
}));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'range'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}

function runtimeAst(path) {
  const source = readFileSync(path, 'utf8');
  const emitted = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { ...parsed.options, noEmit: false },
  }).outputText;
  return canonical(parse(emitted, { ecmaVersion: 'latest', sourceType: 'module' }).body);
}

test('native CLI exposes its existing optional string-array/string inputs and async completion', () => {
  assert.deepEqual(summary.filter(item => item.file === positiveFile), []);
});

test('native CLI rejects incompatible caller inputs and return claims', () => {
  const negative = summary.filter(item => item.file === negativeFile);
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [[2322, 4], [2345, 6], [2322, 8]]);
  assert.match(negative[0].message, /number.*not assignable.*string/i);
  assert.match(negative[1].message, /number.*not assignable.*string/i);
  assert.match(negative[2].message, /Promise<void>.*not assignable.*void/i);
  assert.deepEqual(summary.filter(item => item.file !== positiveFile && item.file !== negativeFile), [],
    'the checked CLI and transitive imports must remain error-free');
});

test('typed native CLI retains the complete original operations and flat direct-run guard', async () => {
  const sourcePath = join(root, 'src/native-review.mjs');
  const emittedPath = join(root, 'dist/native-review.mjs');
  const source = readFileSync(sourcePath, 'utf8');
  const emitted = readFileSync(emittedPath, 'utf8');
  assert.deepEqual(runtimeAst(sourcePath), runtimeAst(emittedPath));
  const implementationSource = join(root, 'src/local-review/native-review.mts');
  const implementationEmitted = join(root, 'dist/local-review/native-review.mjs');
  assert.deepEqual(runtimeAst(implementationSource), runtimeAst(implementationEmitted));
  const operations = runtimeAst(implementationSource)
    .filter(node => node.type === 'FunctionDeclaration' || node.type === 'ExportNamedDeclaration');
  assert.equal(createHash('sha256').update(JSON.stringify(operations)).digest('hex'),
    '47b0c27297dff6281061db1474fc7832f95f9d1fbaf5ce92448585898fc17d5b',
    'the complete pre-migration usage and async CLI operations remain identical after type erasure');
  const flat = await import('../dist/native-review.mjs');
  const grouped = await import('../dist/local-review/native-review.mjs');
  assert.equal(flat.runNativeReviewCli, grouped.runNativeReviewCli);
  for (const text of [source, emitted]) {
    assert.match(text, /if \(process\.argv\[1\] && fileURLToPath\(import\.meta\.url\) === realpathSync\(process\.argv\[1\]\)\)/);
  }
});
