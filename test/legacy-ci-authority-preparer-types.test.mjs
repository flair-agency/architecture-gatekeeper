import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import test from 'node:test';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);

const fixtureRoot = join(root, 'test/fixtures/legacy-ci-authority-preparer-contract');
const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const contractProgram = ts.createProgram([positiveFile, negativeFile], { ...parsed.options, rootDir: root, noEmit: true });
const contractDiagnostics = ts.getPreEmitDiagnostics(contractProgram).map(item => ({
  file: item.file?.fileName,
  code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
}));

test('legacy preparer flat and grouped type contracts expose the operation result', () => {
  assert.deepEqual(contractDiagnostics.filter(item => item.file === positiveFile), []);
  assert.deepEqual(contractDiagnostics.filter(item => item.file !== positiveFile && item.file !== negativeFile), []);
  const negative = contractDiagnostics.filter(item => item.file === negativeFile);
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [[2322, 4], [2322, 5]]);
  assert.match(negative[0].message, /string.*not assignable.*number/i);
  assert.match(negative[1].message, /LegacyAuthorityProvenance.*void/s);
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}

function runtimeAst(sourceText, fileName) {
  const output = ts.transpileModule(sourceText, { fileName, compilerOptions: parsed.options }).outputText;
  const ast = parse(output, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const node of ast.body) {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration') && node.source?.value.endsWith('.mts')) {
      node.source.value = `${node.source.value.slice(0, -4)}.mjs`;
    }
  }
  return canonical(ast.body);
}

// Expand only this reviewed process boundary before comparing the historical
// operation pin. Use the actual helper AST, rather than replacing its call with
// an assumed implementation. Explicit 'buffer' equals Node's former default;
// the controlled-executable tests separately exercise that byte contract.
function expandBufferedGitBoundary(body, helperBody) {
  assert.equal(helperBody.length, 2, 'the helper has no additional top-level operations');
  const [nativeImport, exported] = helperBody;
  assert.equal(nativeImport.type, 'ImportDeclaration');
  assert.equal(nativeImport.source.value, 'node:child_process');
  assert.deepEqual(nativeImport.specifiers.map(item => [item.type, item.imported?.name, item.local.name]),
    [['ImportSpecifier', 'execFileSync', 'execFileSync']]);
  assert.equal(exported.type, 'ExportNamedDeclaration');
  const helper = exported.declaration;
  assert.equal(helper.type, 'FunctionDeclaration');
  assert.equal(helper.id.name, 'runBufferedGit');
  assert.equal(helper.async, false);
  assert.equal(helper.generator, false);
  assert.deepEqual(helper.params.map(item => [item.type, item.name]),
    [['Identifier', 'root'], ['Identifier', 'args']]);
  assert.equal(helper.body.body.length, 1);
  assert.equal(helper.body.body[0].type, 'ReturnStatement');
  const invocation = helper.body.body[0].argument;
  assert.equal(invocation.type, 'CallExpression');
  assert.equal(invocation.callee.name, 'execFileSync');
  assert.equal(invocation.arguments.length, 3);
  assert.deepEqual(invocation.arguments[1], { type: 'Identifier', name: 'args' });
  const options = invocation.arguments[2];
  assert.equal(options.type, 'ObjectExpression');
  assert.deepEqual(options.properties.map(item => [item.type, item.key.name, item.computed, item.kind]),
    [['Property', 'cwd', false, 'init'], ['Property', 'encoding', false, 'init'],
      ['Property', 'maxBuffer', false, 'init']]);
  assert.deepEqual(options.properties[0].value, { type: 'Identifier', name: 'root' });
  assert.equal(options.properties[1].value.type, 'Literal');
  assert.equal(options.properties[1].value.value, 'buffer');
  let expansions = 0;
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' &&
        node.callee.name === 'runBufferedGit') {
      assert.equal(node.arguments.length, 2);
      const expanded = structuredClone(invocation);
      expanded.arguments[1] = node.arguments[1];
      expanded.arguments[2].properties = expanded.arguments[2].properties
        .filter(item => item.key.name !== 'encoding');
      expanded.arguments[2].properties[0].value = node.arguments[0];
      expansions += 1;
      return expanded;
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, expand(value)]));
  }
  const expanded = expand(body);
  assert.equal(expansions, 1, 'only the existing Git diff acquisition is delegated');
  return expanded;
}

function operationNodes(body) {
  const nodes = body.filter(node => node.type !== 'ImportDeclaration' && node.type !== 'ExportAllDeclaration')
    .map(node => node.type === 'ExportNamedDeclaration' ? node.declaration : node).filter(Boolean);
  const cli = nodes.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'runLegacyCiAuthorityCli');
  assert.ok(cli, 'typed leaf owns the original CLI body');
  return [...nodes.filter(node => node !== cli), ...cli.body.body];
}

const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Owner-authorized #591 baseline: commit 821c3eade2d4a48c28e75393bb80ec8ff0184719,
// blob b2890ae8195db3dcff47010125f7f15b7c27f716. The digest covers the full
// operation AST: SHA-256(JSON.stringify(canonical(operationNodes(runtimeAst(
// `git show 821c3ea:src/prepare-legacy-ci-authority.mjs`))))) after extracting
// the direct CLI guard body into the same operation list used for the typed leaf.
const authorized821c3eaOperationAst = '91192065e743f701f8056c00874d7e621ad04202cb1b744e66365ad89829b3fa';

test('complete legacy preparer implementation and flat guard retain their pinned runtime AST', async () => {
  const facadePath = join(root, 'src/prepare-legacy-ci-authority.mts');
  const leafPath = join(root, 'src/ci-review/legacy-ci-authority-preparer.mts');
  const emittedFacadePath = join(root, 'dist/prepare-legacy-ci-authority.mjs');
  const emittedLeafPath = join(root, 'dist/ci-review/legacy-ci-authority-preparer.mjs');
  const facadeSource = readFileSync(facadePath, 'utf8');
  const leafSource = readFileSync(leafPath, 'utf8');
  const emittedLeafSource = readFileSync(emittedLeafPath, 'utf8');
  const facadeBody = runtimeAst(facadeSource, facadePath);
  const emittedFacadeBody = runtimeAst(readFileSync(emittedFacadePath, 'utf8'), emittedFacadePath);
  const leafBody = runtimeAst(leafSource, leafPath);
  const emittedLeafBody = runtimeAst(emittedLeafSource, emittedLeafPath);
  const helperPath = join(root, 'src/git/buffered-git.mts');
  const emittedHelperPath = join(root, 'dist/git/buffered-git.mjs');
  const helperBody = runtimeAst(readFileSync(helperPath, 'utf8'), helperPath);
  const emittedHelperBody = runtimeAst(readFileSync(emittedHelperPath, 'utf8'), emittedHelperPath);
  assert.deepEqual(facadeBody, emittedFacadeBody);
  assert.deepEqual(leafBody, emittedLeafBody);
  assert.deepEqual(helperBody, emittedHelperBody, 'source/emitted shared process operations');

  const facadeGuard = facadeBody.find(node => node.type === 'IfStatement');
  const emittedGuard = emittedFacadeBody.find(node => node.type === 'IfStatement');
  assert.ok(facadeGuard);
  assert.equal(facadeGuard.test.operator, '||');
  assert.equal(hash(facadeGuard.test.left), '4cedd42e70e8f91b92b42a017900b344703c2540d125d3956bf26acbb707c159');
  const authoredGuard = runtimeAst("if (process.argv[1]?.endsWith('/prepare-legacy-ci-authority.mts')) {}", facadePath)[0];
  assert.deepEqual(facadeGuard.test.right, authoredGuard.test, 'the added branch permits the physical authored entrypoint');
  assert.equal(hash(emittedGuard.test), hash(facadeGuard.test));
  assert.equal(facadeGuard.consequent.type, 'ExpressionStatement');
  assert.equal(facadeGuard.consequent.expression.type, 'CallExpression');
  assert.equal(facadeGuard.consequent.expression.callee.name, 'runLegacyCiAuthorityCli');
  assert.equal(hash(operationNodes(expandBufferedGitBoundary(leafBody, helperBody))), authorized821c3eaOperationAst,
    'expanding the verified process helper retains the owner-authorized 821c3ea operation pin');
  const typedLeaf = ts.createSourceFile(leafPath, leafSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sourceImports = typedLeaf.statements.filter(ts.isImportDeclaration)
    .map(node => node.moduleSpecifier.text);
  const emittedImports = parse(emittedLeafSource, { ecmaVersion: 'latest', sourceType: 'module' }).body
    .filter(node => node.type === 'ImportDeclaration').map(node => node.source.value);
  assert.deepEqual(sourceImports, [
    'node:path', 'node:util', '../git/buffered-git.mts', '../runner-temp-path.mts', '../resolve-ci-policy.mts',
    '../legacy-git-snapshot.mts', '../github-runner-workspace.mts', './legacy-authority-decision.mts',
  ]);
  assert.deepEqual(emittedImports, [
    'node:path', 'node:util', '../git/buffered-git.mjs', '../runner-temp-path.mjs', '../resolve-ci-policy.mjs',
    '../legacy-git-snapshot.mjs', '../github-runner-workspace.mjs', './legacy-authority-decision.mjs',
  ]);

  const flat = await import('../dist/prepare-legacy-ci-authority.mjs');
  const grouped = await import('../dist/ci-review/legacy-ci-authority-preparer.mjs');
  assert.deepEqual(Object.keys(flat).sort(), ['prepareLegacyAuthority', 'validateLegacyAuthorityDecision']);
  assert.equal(flat.prepareLegacyAuthority, grouped.prepareLegacyAuthority);
  assert.equal(flat.validateLegacyAuthorityDecision, grouped.validateLegacyAuthorityDecision);
});
