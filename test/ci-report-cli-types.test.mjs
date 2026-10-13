import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'src/ci-report.mjs');
const source = readFileSync(sourcePath, 'utf8');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.allowJs, true);
assert.match(source, /^\/\/ @ts-check$/m);

// Append compile-only calls to a virtual copy of the actual exported CLI
// source so its supported transport and completion contracts stay checked.
function diagnosticsFor(probe) {
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, ...args) => file === sourcePath
    ? ts.createSourceFile(file, `${source}\n${probe}\n`, languageVersion, true, ts.ScriptKind.JS)
    : originalGetSourceFile(file, languageVersion, ...args);
  return ts.getPreEmitDiagnostics(ts.createProgram([sourcePath], options, host)).map(item => ({
    file: item.file?.fileName,
    code: item.code,
    line: item.file && item.start !== undefined
      ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

test('report CLI accepts an optional ReportFetch and returns Promise<void>', () => {
  for (const probe of [
    '/** @type {Promise<void>} */ const completion = main();',
    '/** @type {Promise<void>} */ const completion = main(undefined);',
    '/** @type {import("./ci-review/ci-report.mts").ReportFetch} */ const transport = fetch; /** @type {Promise<void>} */ const completion = main(transport);',
  ]) assert.deepEqual(diagnosticsFor(probe), []);
});

test('report CLI rejects argv and a value-producing completion claim', () => {
  const cases = [
    { probe: "main(['unused']);", code: 2345, message: /not assignable.*ReportFetch/s },
    { probe: '/** @type {Promise<string>} */ const completion = main();', code: 2322,
      message: /Promise<void>.*Promise<string>/s },
  ];
  for (const { probe, code, message } of cases) {
    const diagnostics = diagnosticsFor(probe);
    assert.equal(diagnostics.length, 1, 'every unexpected or transitive diagnostic must fail');
    assert.equal(diagnostics[0].file, sourcePath);
    assert.equal(diagnostics[0].line, source.split('\n').length + 1);
    assert.equal(diagnostics[0].code, code);
    assert.match(diagnostics[0].message, message);
  }
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}

function runtimeDigest(text) {
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration' && node.source.value.endsWith('.mts')) {
      node.source.value = `${node.source.value.slice(0, -4)}.mjs`;
    }
  }
  return createHash('sha256').update(JSON.stringify(canonical(ast.body))).digest('hex');
}

test('source and emitted report CLI bind the complete reviewed merged runtime AST', () => {
  // Historical pre-change baseline at e6cb272d1c78dea50a48eee1ad9c523b260187b0:
  // 105764db4749d7ac70ef554bb1185b415bd40d367b93e93a0d8b896c8fa0ad30.
  // Reviewed merge: main 89189 + feature c568; the historical digest is not
  // an equivalence claim for the intentionally added feature CLI behavior.
  // Only coordinates, literal spelling and the compiler's .mts import rewrite
  // are normalized. Main, exports, property reads, dispatch and sinks are bound.
  const baseline = '0e7aa8c11145d9f604a7b28e23691e2484917ea17329be597dfdbfc384c4aaaa';
  assert.equal(runtimeDigest(source), baseline);
  assert.equal(runtimeDigest(readFileSync(join(root, 'dist/ci-report.mjs'), 'utf8')), baseline);
});
