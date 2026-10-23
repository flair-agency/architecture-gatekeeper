import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'test/fixtures/owner-addition-cli-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.noEmitOnError, true);
const positive = join(fixture, 'positive.mts');
const negative = join(fixture, 'negative.mts');
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
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function sourceAst(path) {
  const source = readFileSync(path, 'utf8');
  const output = path.endsWith('.mts')
    ? ts.transpileModule(source, { fileName: path, compilerOptions: parsed.options }).outputText
    : source;
  return parse(output, { ecmaVersion: 'latest', sourceType: 'module' }).body;
}
function declaration(body, name) {
  return body.map(node => node.type === 'ExportNamedDeclaration' ? node.declaration : node)
    .find(node => node?.type === 'FunctionDeclaration' && node.id?.name === name);
}
function guard(body) { return body.find(node => node.type === 'IfStatement' && node.test?.type === 'LogicalExpression'); }

// Complete operation pins from owner-approved fixed-boundary baseline 821c3ea.
// See #591 comment6235948030. The prepare/validate/multiPrepare pins below
// include the explicit v6 selection extension, covered by the v2/v4/v5/v6
// real-Git CLI, exact-evidence negative and procedural composition tests.
const expected = {
  directRunTest: '37898c466f4c3a32fc0d2e4cc9284078762934545bb846b52fd75a2d8bb97049',
  prepare: '9bde9480d6434a82a8a5ed85d292ca99b17509cf86eaf14bd958f3855bf18329',
  resolver: '76a4f0ff851fc6301213eee8735b5db34138e44c72b0ff6319aea1fc01831af6',
  validate: '87c7ceb0751835aa97f300c1dcf1dbe102f6158c44b0f1ee5afb2e4b8208120c',
  // Includes the approved bounded publication follow-up from JS91c4e24.
  multiPrepare: '48f49cf127d1f95e4981a9bceefe56ce9135f152feb41363ab913af150e388ee',
};

test('owner-addition CI retains the original direct-run condition and complete operation AST', async () => {
  const facadePath = join(root, 'src/owner-addition-ci.mjs');
  const sourceFacade = sourceAst(facadePath);
  const emittedFacade = sourceAst(join(root, 'dist/owner-addition-ci.mjs'));
  assert.deepEqual(canonical(guard(sourceFacade)), canonical(guard(emittedFacade)), 'source/emitted direct-run guard and dispatch');
  assert.equal(digest(guard(sourceFacade).test), expected.directRunTest);
  assert.equal(digest(guard(emittedFacade).test), expected.directRunTest);
  const dispatch = guard(sourceFacade).consequent.body[0];
  assert.equal(dispatch.test.right.value, 'prepare');
  assert.equal(dispatch.consequent.expression.argument.callee.name, 'prepare');
  const cliEnvironment = dispatch.consequent.expression.argument.arguments[0];
  assert.equal(cliEnvironment.type, 'ObjectExpression');
  assert.equal(cliEnvironment.properties[1].key.name, 'GITHUB_WORKSPACE');
  assert.equal(cliEnvironment.properties[1].value.callee.name, 'trustedGitHubWorkspaceRoot');
  assert.equal(dispatch.alternate.test.right.value, 'validate');
  assert.equal(dispatch.alternate.consequent.expression.callee.name, 'validateOwnerAdditionCiCli');
  assert.equal(dispatch.alternate.alternate.argument.callee.name, 'Error');

  const source = sourceAst(join(root, 'src/owner-addition/owner-addition-ci-operations.mts'));
  const emitted = sourceAst(join(root, 'dist/owner-addition/owner-addition-ci-operations.mjs'));
  for (const [name, pin] of [['prepare', expected.prepare],
    ['resolveSingleOwnerAdditionAuthorityId', expected.resolver]]) {
    assert.deepEqual(canonical(declaration(source, name).body), canonical(declaration(emitted, name).body), `${name} source/emitted AST`);
    assert.equal(digest(declaration(source, name).body), pin, `${name} matches the retained operation snapshot`);
  }
  const sourceValidate = declaration(source, 'validateOwnerAdditionCiCli');
  const emittedValidate = declaration(emitted, 'validateOwnerAdditionCiCli');
  assert.deepEqual(canonical(sourceValidate.body), canonical(emittedValidate.body));
  assert.equal(digest(sourceValidate.body.body), expected.validate,
    'the validate branch matches the retained operation snapshot');
});

test('multi-authority API retains its full operation AST and flat exports are identity re-exports', async () => {
  const source = sourceAst(join(root, 'src/owner-addition/owner-addition-multiauthority.mts'));
  const emitted = sourceAst(join(root, 'dist/owner-addition/owner-addition-multiauthority.mjs'));
  assert.deepEqual(canonical(declaration(source, 'prepareMultiAuthorityAddition').body),
    canonical(declaration(emitted, 'prepareMultiAuthorityAddition').body));
  assert.equal(digest(declaration(source, 'prepareMultiAuthorityAddition').body), expected.multiPrepare);

  const sourceFlatCi = await import('../src/owner-addition-ci.mjs');
  const sourceCiOperations = await import('../src/owner-addition/owner-addition-ci-operations.mts');
  const sourceFlatMulti = await import('../src/owner-addition-multiauthority.mjs');
  const sourceMultiOperations = await import('../src/owner-addition/owner-addition-multiauthority.mts');
  const flatCi = await import('../dist/owner-addition-ci.mjs');
  const ciOperations = await import('../dist/owner-addition/owner-addition-ci-operations.mjs');
  const flatMulti = await import('../dist/owner-addition-multiauthority.mjs');
  const multiOperations = await import('../dist/owner-addition/owner-addition-multiauthority.mjs');
  const validators = await import('../dist/owner-addition-validation.mjs');
  assert.deepEqual(Object.keys(flatCi).sort(), ['resolveSingleOwnerAdditionAuthorityId', 'validateOrdinaryOwnerDecision',
    'validateOrdinaryOwnerDecisionSchema', 'validateOwnerAdditionEligibility', 'validateOwnerAdditionEligibilitySchema'].sort());
  assert.equal(flatCi.resolveSingleOwnerAdditionAuthorityId, ciOperations.resolveSingleOwnerAdditionAuthorityId);
  assert.equal(sourceFlatCi.resolveSingleOwnerAdditionAuthorityId, sourceCiOperations.resolveSingleOwnerAdditionAuthorityId);
  assert.deepEqual(Object.keys(sourceFlatCi).sort(), Object.keys(flatCi).sort());
  for (const name of ['validateOwnerAdditionEligibility', 'validateOwnerAdditionEligibilitySchema',
    'validateOrdinaryOwnerDecision', 'validateOrdinaryOwnerDecisionSchema']) assert.equal(flatCi[name], validators[name], name);
  assert.deepEqual(Object.keys(flatMulti).sort(), ['prepareMultiAuthorityAddition', 'validateMultiAuthorityEligibility',
    'validateMultiAuthorityEligibilitySchema'].sort());
  for (const name of Object.keys(flatMulti)) assert.equal(flatMulti[name], multiOperations[name], name);
  assert.deepEqual(Object.keys(sourceFlatMulti).sort(), Object.keys(flatMulti).sort());
  for (const name of Object.keys(sourceFlatMulti)) assert.equal(sourceFlatMulti[name], sourceMultiOperations[name], name);
});

test('owner-addition operations accept their synchronous, Promise and thenable transport contracts', () => {
  assert.deepEqual(diagnostics.filter(item => item.file === positive), []);
});

test('owner-addition public contracts reject incorrect API and callback operations with exact diagnostics', () => {
  assert.deepEqual(diagnostics.filter(item => item.file !== negative && item.file !== positive), [],
    'every unexpected implementation or transitive diagnostic must fail');
  const local = diagnostics.filter(item => item.file === negative);
  assert.deepEqual(local.map(({ code, line }) => [code, line]), [[2345, 7], [2322, 8], [2322, 9], [2353, 11]]);
  assert.match(local[0].message, /number.*BinaryLike|BinaryLike.*number/);
  assert.match(local[1].message, /AuthoritySetFetcher|function/i);
  assert.match(local[2].message, /Promise<void>|void/);
  assert.match(local[3].message, /BinaryLike|bytes/);
});
