import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';
import { fixture, spec, commitOn, ordinary, decision } from './fixtures/preview-lifecycle-runtime.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/materialize-regular-git-snapshot-migration-contract');
const hash = value => createHash('sha256').update(value).digest('hex');
const stripPositions = value => Array.isArray(value) ? value.map(stripPositions) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc', 'range'].includes(key)).map(([key, child]) => [key, stripPositions(child)]))
  : value;
const nodeHash = node => hash(JSON.stringify(stripPositions(node)));
const parseModule = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module' });

const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const config = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(config.errors, []);
assert.equal(config.options.strict, true);
assert.equal(config.options.noImplicitAny, true);
assert.equal(config.options.noEmitOnError, true);
const compilerOptions = { ...config.options, rootDir: root, noEmit: true };
const fixtureFiles = ['positive.mts', 'negative.mts'].map(name => join(fixtureRoot, name));
const diagnosticsForFixture = compileFixtureDiagnostics(fixtureFiles, compilerOptions,
  'imports and authored declarations must be error-free');

function diagnosticsFor(fixtureName) {
  return diagnosticsForFixture(join(fixtureRoot, fixtureName)).map(diagnostic => ({
    code: diagnostic.code, line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

function exportFunction(ast, name) {
  return ast.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' && node.declaration.id.name === name)?.declaration;
}

function runtimeOperationHashes(source) {
  const ast = parseModule(source);
  const body = exportFunction(ast, 'materializeRegularGitSnapshot')?.body.body;
  const cli = exportFunction(ast, 'runMaterializeRegularGitSnapshotCli')?.body.body;
  assert.ok(body, 'materializer implementation is emitted as an exported function');
  assert.ok(cli, 'CLI operations are in the typed exported helper');
  return { materializer: body.map(nodeHash), cli: cli.map(nodeHash) };
}

test('materializer facade keeps unknown observations and a non-validating typed CLI contract', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [[2345, 6], [2322, 7], [2322, 8], [2554, 9]]);
  assert.match(diagnostics[0].message, /outputPath.*missing/i);
  assert.match(diagnostics[1].message, /unknown.*not assignable.*string/i);
  assert.match(diagnostics[2].message, /string.*not assignable.*number/i);
  assert.match(diagnostics[3].message, /expected 0 arguments/i);
});

test('source and emitted operations preserve the original materializer and exact bounded CLI guard', () => {
  const oldMaterializer = [
    '50ce37287fb67c5ca2a3c013a254f69b49f1c9ba038be841abb14ba783389dc5',
    '0df5ed342f33de357bcec73746b8adb0bc82e20f306ea8fad3208b4c370d171f',
    '733619fec6904ceb99fe5676d16f55d4384eb26b9a9133e456727b9da49c2bd6',
    '910172fb792a4907a6f649eca71ace99a2dde8c5aa20b4a5c6fad8c166d1bb4c',
  ];
  const boundedCli = [
    '6e68db107705473ee21a42e7964c12bfaeeb71ed4dfdcf33e85bd1b6c82ad13c',
    'bcda9dc440848a9519bc16dd3eb3b0c35b2d6e6be2b67667e41ffaa59a48169b',
    '4d1cf4019ca61bd7176da7dc44d2c8d1143f785e94cfb44c53406701550189ba',
    'd403704fa4a67e5efbc2054da10be3148e3168fad464b726dd0db799f6b29d7e',
    'badb0353e681887e5eeb87577462e251235aed91b73cf187afe0228080568c75',
    '3a8a27ace29af6c04e9a5e16debcdb6761697d91197c51321cfbc6cbfccb913f',
    'a41ee065f5d5203bdec9653f7433a884a7172eecb1d54a3ed66a9fb00d266a46',
  ];
  const expectedGuardTest = 'b2c2410d297b6ec64395eabc4c5552fe9489be5a27ff22720501c89f1473bc09';
  for (const facadePath of ['src/materialize-regular-git-snapshot.mjs', 'dist/materialize-regular-git-snapshot.mjs']) {
    const guard = parseModule(readFileSync(join(root, facadePath), 'utf8')).body.find(node => node.type === 'IfStatement');
    assert.ok(guard, `${facadePath} retains a flat direct-run guard`);
    assert.equal(nodeHash(guard.test), expectedGuardTest, `${facadePath} keeps the original direct-run guard AST`);
  }
  const sourceLeaf = readFileSync(join(root, 'src/review-inputs/materialize-regular-git-snapshot.mts'), 'utf8');
  const emittedLeaf = readFileSync(join(root, 'dist/review-inputs/materialize-regular-git-snapshot.mjs'), 'utf8');
  const transpiledLeaf = ts.transpileModule(sourceLeaf, { fileName: 'materialize-regular-git-snapshot.mts', compilerOptions: { ...ts.getDefaultCompilerOptions(), module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, rewriteRelativeImportExtensions: true } }).outputText;
  const emittedOperations = runtimeOperationHashes(emittedLeaf);
  assert.deepEqual(runtimeOperationHashes(transpiledLeaf), emittedOperations, 'the built runtime corresponds to authored typed source');
  assert.deepEqual(emittedOperations.materializer, oldMaterializer, 'guard, Git read, native write, and return remain in their original order');
  assert.deepEqual(emittedOperations.cli, boundedCli, 'exact CLI keeps argument checks and output append, reads workspace once, preserves missing-root failure, and confines only the CLI destination');
});

test('real source and emitted runtime identities bind the new leaf and reject stale requests and receipts', async t => {
  const f = fixture(t);
  const head = commitOn(f, 'materializer-runtime-identity', { 'app.txt': 'Materializer identity fixture\n' });
  for (const facadePath of ['src/materialize-regular-git-snapshot.mjs', 'dist/materialize-regular-git-snapshot.mjs']) {
    const facade = await import(pathToFileURL(join(root, facadePath)).href);
    assert.deepEqual(Object.keys(facade), ['materializeRegularGitSnapshot'], `${facadePath} preserves the flat export identity`);
    const outputPath = join(f.root, `materialized-${facadePath.startsWith('src/') ? 'source' : 'emitted'}.txt`);
    const result = facade.materializeRegularGitSnapshot({ root: f.root, commit: f.base, path: 'docs/authority.md', outputPath });
    const expectedBytes = readFileSync(join(f.root, 'docs/authority.md'));
    assert.deepEqual(result, { path: 'docs/authority.md', sha256: hash(expectedBytes) });
    assert.deepEqual(readFileSync(outputPath), expectedBytes);
  }
  const layouts = [
    { name: 'source', tree: 'src', runtime: 'src/preview-lifecycle.mjs', leaf: 'src/review-inputs/materialize-regular-git-snapshot.mts', key: 'review-inputs/materialize-regular-git-snapshot.mts' },
    { name: 'emitted', tree: 'dist', runtime: 'dist/preview-lifecycle.mjs', leaf: 'dist/review-inputs/materialize-regular-git-snapshot.mjs', key: 'review-inputs/materialize-regular-git-snapshot.mjs' },
  ];
  for (const layout of layouts) {
    const runtimeRoot = mkdtempSync(join(tmpdir(), `materializer-${layout.name}-identity-`));
    t.after(() => rmSync(runtimeRoot, { recursive: true, force: true }));
    cpSync(join(root, layout.tree), join(runtimeRoot, layout.tree), { recursive: true });
    copyFileSync(join(root, 'package.json'), join(runtimeRoot, 'package.json'));
    const runtime = await import(pathToFileURL(join(runtimeRoot, layout.runtime)).href);
    const request = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
    const leafPath = join(runtimeRoot, layout.leaf);
    assert.equal(request.runtime.files[layout.key], hash(readFileSync(leafPath)), `${layout.name} request records actual leaf bytes`);
    const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
    await runtime.validatePreviewReceipt(receipt, f.root);

    appendFileSync(leafPath, '\n// isolated identity mutation\n');
    const freshRequest = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
    assert.notEqual(freshRequest.runtime.files[layout.key], request.runtime.files[layout.key]);
    assert.equal(freshRequest.runtime.files[layout.key], hash(readFileSync(leafPath)));
    await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root), /request differs from immutable predecessor inputs/);
    await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root), /request differs from immutable predecessor inputs/);
    const freshReceipt = await runtime.completePreviewLifecycle(freshRequest, ordinary(decision()), f.root);
    await runtime.validatePreviewReceipt(freshReceipt, f.root);
  }
});
