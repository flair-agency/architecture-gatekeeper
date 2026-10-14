import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-addition-finalizer-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.noEmitOnError, true);
const positive = join(fixtureRoot, 'positive.mts');
const negative = join(fixtureRoot, 'negative.mts');
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([positive, negative], {
  ...parsed.options, rootDir: root, noEmit: true,
})).map(item => ({ file: item.file?.fileName, code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}

function runtimeAst(path) {
  const source = readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, { fileName: path, compilerOptions: parsed.options }).outputText;
  return canonical(parse(output, { ecmaVersion: 'latest', sourceType: 'module' }).body);
}

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('complete finalizer accepts native, sync, async and thenable fetch composition with unknown observations', () => {
  assert.deepEqual(diagnostics.filter(item => item.file === positive), []);
});

test('complete finalizer rejects missing inputs, wrong callback/completion and narrowed external observations', () => {
  assert.deepEqual(diagnostics.filter(item => item.file !== negative && item.file !== positive), [],
    'every unexpected implementation or transitive diagnostic must fail');
  const local = diagnostics.filter(item => item.file === negative);
  assert.deepEqual(local.map(({ code, line }) => [code, line]), [
    [2345, 4], [2322, 5], [2322, 6], [2322, 7], [2322, 8], [2554, 9], [2322, 11], [2322, 14], [2322, 19],
  ]);
  assert.match(local[0].message, /missing.*pullRequestNumber.*githubToken.*runId/s);
  assert.match(local[1].message, /OwnerAdditionFinalRecord.*void/s);
  assert.match(local[2].message, /string.*number/s);
  for (const index of [3, 4, 6, 7, 8]) assert.match(local[index].message, /unknown/s);
  assert.match(local[5].message, /Expected 0 arguments/);
});

test('complete finalizer body and CLI retain all risk-corrected operations and flat dispatch', async () => {
  const source = runtimeAst(join(root, 'src/owner-addition/finalize-owner-addition.mts'));
  const emitted = runtimeAst(join(root, 'dist/owner-addition/finalize-owner-addition.mjs'));
  assert.deepEqual(source, emitted);
  const cli = source.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.id?.name === 'runOwnerAdditionFinalizeCli');
  const operations = source.filter(node => node.type !== 'ImportDeclaration' && node !== cli);
  assert.deepEqual(source.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value), [
    'node:crypto', 'node:child_process', 'node:fs', '../resolve-ci-policy.mjs',
    '../github-owner-addition-provenance.mjs', '../github-owner-addition-readback.mjs',
    '../owner-decision-addition.mjs', '../authority-set.mjs', './owner-addition-finalize.mjs',
  ], 'preserve original compatibility-module imports and their existing guards');
  // Immutable 1e3cec1e is the corrected complete flat body, including all three
  // resource corrections. Its bytes must also match the adopted fix baseline.
  assert.equal(digest(operations), '53152b445b1bf6abc7574380f06a8baa8a5e818b2bcd0868437cfdcd76b786a4');
  assert.equal(digest(cli.declaration.body), '0d2ffb2f37822955123277d51db1e35e3ad1f4d31e61acd1cc7ca985101f06e6');
  const facade = runtimeAst(join(root, 'src/owner-addition-finalize.mjs'));
  assert.deepEqual(facade, runtimeAst(join(root, 'dist/owner-addition-finalize.mjs')));
  assert.equal(digest(facade.at(-1).test), '9fed90433dea3f8efa9bd315282edbcd920b68170b833132e345d2b4d482a4f5');
  assert.deepEqual(facade.at(-1).consequent.body, [{ type: 'ExpressionStatement', expression: {
    type: 'AwaitExpression', argument: { type: 'CallExpression', callee: { type: 'Identifier', name: 'runOwnerAdditionFinalizeCli' }, arguments: [], optional: false },
  } }]);
  const flat = await import('../dist/owner-addition-finalize.mjs');
  const physical = await import('../dist/owner-addition/finalize-owner-addition.mjs');
  const exports = ['buildOwnerAdditionFinalRecord', 'verifyG0TagObjectEvidence', 'readG0TagObjectReadback',
    'summarizeG0TagRefReadback', 'verifyMergeAncestorComparison', 'parsePinnedGatekeeperWorkflow',
    'validateOwnerAdditionProducerJobName', 'parseGatekeeperWorkflowDefaults', 'finalizeOwnerAddition'];
  assert.deepEqual(Object.keys(flat).sort(), [...exports].sort(), 'flat public exports remain exact');
  for (const name of exports) assert.equal(flat[name], physical[name], name);
});
