import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'src/ci-report.mts');
const source = readFileSync(sourcePath, 'utf8');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.allowJs ?? false, false);

// Compile independent virtual copies of the actual exported CLI together.
// They share a directory with the facade, so its relative imports resolve as
// they do for the physical source. Each probe keeps its own module scope.
const probes = Object.freeze([
  'const completion: Promise<void> = main();',
  'const completion: Promise<void> = main(undefined);',
  'const transport: import("./ci-review/ci-report.mts").ReportFetch = fetch; const completion: Promise<void> = main(transport);',
  "main(['unused']);",
  'const completion: Promise<string> = main();',
]);
const virtualPaths = Object.freeze(probes.map((_, index) => join(dirname(sourcePath), `__ci-report-type-probe-${index}.mts`)));
const options = { ...parsed.options, noEmit: true };
const virtualSources = new Map(virtualPaths.map((file, index) => [file, `${source}\n${probes[index]}\n`]));
const host = ts.createCompilerHost(options);
const originalGetSourceFile = host.getSourceFile.bind(host);
const originalFileExists = host.fileExists.bind(host);
host.fileExists = file => virtualSources.has(file) || originalFileExists(file);
host.getSourceFile = (file, languageVersion, ...args) => virtualSources.has(file)
  ? ts.createSourceFile(file, virtualSources.get(file), languageVersion, true, ts.ScriptKind.TS)
  : originalGetSourceFile(file, languageVersion, ...args);
const allDiagnostics = ts.getPreEmitDiagnostics(ts.createProgram(virtualPaths, options, host));
const unexpectedDependencyDiagnostics = allDiagnostics.filter(item => !virtualSources.has(item.file?.fileName));
assert.deepEqual(unexpectedDependencyDiagnostics.map(item => ({
  file: item.file?.fileName, code: item.code,
  line: item.file && item.start !== undefined
    ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
})), [], 'every unexpected or transitive diagnostic must fail');
function diagnosticsFor(index) {
  assert.ok(Number.isInteger(index) && index >= 0 && index < virtualPaths.length,
    `Uncompiled report type probe: ${index}`);
  return allDiagnostics.filter(item => item.file?.fileName === virtualPaths[index]).map(item => ({
    // The virtual module is an independent copy of this physical facade.
    file: sourcePath,
    code: item.code,
    line: item.file && item.start !== undefined
      ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

test('report CLI accepts an optional ReportFetch and returns Promise<void>', () => {
  for (const index of [0, 1, 2]) assert.deepEqual(diagnosticsFor(index), []);
});

test('report CLI rejects argv and a value-producing completion claim', () => {
  const cases = [
    { index: 3, code: 2345, message: /not assignable.*ReportFetch/s },
    { index: 4, code: 2322,
      message: /Promise<void>.*Promise<string>/s },
  ];
  for (const { index, code, message } of cases) {
    const diagnostics = diagnosticsFor(index);
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

function runtimeAst(text, fileName) {
  const output = ts.transpileModule(text, { fileName, compilerOptions: parsed.options }).outputText;
  const ast = parse(output, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const node of ast.body) {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration') && node.source?.value.endsWith('.mts')) {
      node.source.value = `${node.source.value.slice(0, -4)}.mjs`;
    }
  }
  return canonical(ast.body);
}

test('complete report source and emitted CLI preserve adopted operations, imports and exact flat guard', async () => {
  const groupedPath = join(root, 'src/ci-review/ci-report-entrypoint.mts');
  const physical = runtimeAst(readFileSync(groupedPath, 'utf8'), groupedPath);
  const emittedPath = join(root, 'dist/ci-review/ci-report-entrypoint.mjs');
  const emitted = runtimeAst(readFileSync(emittedPath, 'utf8'), emittedPath);
  assert.deepEqual(physical, emitted);
  const facade = runtimeAst(source, sourcePath);
  const emittedFacadePath = join(root, 'dist/ci-report.mjs');
  assert.deepEqual(facade, runtimeAst(readFileSync(emittedFacadePath, 'utf8'), emittedFacadePath));
  const operations = [...physical.filter(node => node.type !== 'ImportDeclaration'), facade.at(-1)];
  // Immutable adopted51215db9: all original helper and complete main operations.
  // The former whole-program hash0e7aa8c1 includes imports before relocation.
  assert.equal(createHash('sha256').update(JSON.stringify(operations)).digest('hex'),
    '4085b9db0adbbd0900f612f86e9478d4c081cc67da2d44c3151cfda5b5ce3970');
  assert.equal(createHash('sha256').update(JSON.stringify(facade.at(-1))).digest('hex'),
    '18585ceaab740b5908703195f247a312667f7383aecc08fb18f86e8406c0e46e');
  assert.deepEqual(physical.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value), [
    'node:fs/promises', 'node:fs', 'node:path', '../runner-temp-path.mjs',
    '../github-runner-env.mjs', '../ordinary-gemini-ci-publication.mjs',
    '../multi-authority-provenance.mjs', './ci-report.mjs',
  ], 'preserve original compatibility imports; original node:url guard binding stays flat');
  const flat = await import('../dist/ci-report.mjs');
  const group = await import('../dist/ci-review/ci-report-entrypoint.mjs');
  const names = ['COMMENT_MARKER', 'sanitizeReportApiContext', 'digestDecision', 'validateInlineFindings',
    'formatInlineFindingHeading', 'postInlineReview', 'parseAuthorityProvenance',
    'parseLegacyAuthorityProvenance', 'parseOwnerAdditionProcedure', 'classifyReview',
    'renderReport', 'upsertPullRequestComment', 'loadCodexPassReport', 'main'];
  assert.deepEqual(Object.keys(flat).sort(), [...names].sort());
  for (const name of names) assert.equal(flat[name], group[name], name);
});
