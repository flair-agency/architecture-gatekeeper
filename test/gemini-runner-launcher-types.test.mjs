import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-runner-launcher-contract');
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
  return ast.body.map(canonical);
}

function declarations(nodes) {
  return new Map(nodes.map(node => node.type === 'ExportNamedDeclaration' ? node.declaration : node)
    .filter(node => node?.type === 'FunctionDeclaration').map(node => [node.id.name, node]));
}

function sha(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

const migrationCases = [
  {
    flatSource: join(root, 'src/gemini-ci-runner.mts'), flatEmitted: join(root, 'dist/gemini-ci-runner.mjs'),
    source: join(root, 'src/gemini-cli/ci-runner-entrypoint.mts'), emitted: join(root, 'dist/gemini-cli/ci-runner-entrypoint.mjs'),
    operationNames: ['parseArgs', 'resolveReviewRequest', 'formatGitHubReviewOutputs', 'runGeminiCiReview'],
    cliName: 'runGeminiCiReviewCli', operationsHash: '462f33ec697247d5a6722716a4250d6c1db141283e77816b793a0a86d74368a1',
    exports: ['formatGitHubReviewOutputs', 'parseArgs', 'resolveReviewRequest', 'resolveSafePath', 'runGeminiCiReview'],
  },
  {
    flatSource: join(root, 'src/gemini-launcher.mts'), flatEmitted: join(root, 'dist/gemini-launcher.mjs'),
    source: join(root, 'src/gemini-cli/launcher-entrypoint.mts'), emitted: join(root, 'dist/gemini-cli/launcher-entrypoint.mjs'),
    operationNames: ['buildIsolatedRunnerEnv', 'runIsolatedGeminiSession'],
    cliName: 'runGeminiLauncherCli', operationsHash: 'bb66bb7d482b97a2878e0fc92cf200ca113e6db6dc381b733b1eb73486f75e1a',
    exports: ['buildIsolatedRunnerEnv', 'runIsolatedGeminiSession'],
  },
];

test('runner and launcher public caller contracts accept existing inputs and completion results', () => {
  assert.deepEqual(summary.filter(item => item.file === positiveFile), []);
});

test('runner and launcher reject incompatible caller inputs and return claims at exact diagnostics', () => {
  const negative = summary.filter(item => item.file === negativeFile);
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [[2322, 4], [2345, 5], [2322, 6], [2345, 7], [2322, 8]]);
  assert.match(negative[0].message, /number.*not assignable.*string/i);
  assert.match(negative[2].message, /Promise<unknown>.*not assignable.*Promise<string>/i);
  assert.deepEqual(summary.filter(item => item.file !== positiveFile && item.file !== negativeFile), [],
    'the typed entrypoints and all transitive imports remain error-free');
});

test('typed operations preserve complete original bodies and direct-run guard conditions after type erasure', () => {
  for (const item of migrationCases) {
    const typed = runtimeAst(readFileSync(item.source, 'utf8'), item.source);
    const emitted = runtimeAst(readFileSync(item.emitted, 'utf8'), item.emitted);
    assert.deepEqual(typed, emitted, 'typed implementation source and emitted operations match');
    const typedFunctions = declarations(typed);
    const newOperations = [...item.operationNames.map(name => typedFunctions.get(name)), ...typedFunctions.get(item.cliName).body.body].map(canonical);
    if (item.cliName === 'runGeminiLauncherCli') {
      // The grouped launcher must resolve the original flat child, one directory above.
      const launcher = newOperations.find(node => node.id?.name === 'runIsolatedGeminiSession');
      const runner = launcher.body.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'runnerPath');
      const relocation = runner.declarations[0].init.right.arguments;
      assert.equal(relocation.length, 3);
      assert.deepEqual(relocation[1], { type: 'Literal', value: '..' });
      const selector = parse("import.meta.url.endsWith('.mts') ? 'gemini-ci-runner.mts' : 'gemini-ci-runner.mjs'", { ecmaVersion: 'latest', sourceType: 'module' }).body[0].expression;
      assert.deepEqual(relocation[2], canonical(selector), 'source and emitted launchers select their physical sibling runner');
      relocation[2] = { type: 'Literal', value: 'gemini-ci-runner.mjs' }; // Normalize the separately asserted extension selection.
      relocation.splice(1, 1); // Normalize only the asserted package-relative relocation for the baseline pin.
    }
    assert.equal(sha(newOperations), item.operationsHash, 'original operations retain only the asserted flat-child relocation');

    const originalGuardHash = '9fed90433dea3f8efa9bd315282edbcd920b68170b833132e345d2b4d482a4f5';
    for (const path of [item.flatSource, item.flatEmitted]) {
      const flatAst = runtimeAst(readFileSync(path, 'utf8'), path);
      const guards = flatAst.filter(node => node.type === 'IfStatement');
      assert.equal(guards.length, 1);
      assert.equal(sha(guards[0].test), originalGuardHash, `${path} keeps the original flat guard condition`);
    }
  }
});

test('source and emitted flat facades preserve their exports and implementation identities', async () => {
  for (const item of migrationCases) {
    assert.deepEqual(runtimeAst(readFileSync(item.flatSource, 'utf8'), item.flatSource),
      runtimeAst(readFileSync(item.flatEmitted, 'utf8'), item.flatEmitted));
    const sourceFlat = await import(new URL(item.flatSource, 'file://'));
    const sourceGroup = await import(new URL(item.source, 'file://'));
    const emittedFlat = await import(new URL(item.flatEmitted, 'file://'));
    const emittedGroup = await import(new URL(item.emitted, 'file://'));
    assert.deepEqual(Object.keys(emittedFlat).sort(), [...item.exports].sort());
    for (const name of item.exports) {
      assert.equal(sourceFlat[name], sourceGroup[name], `${name} source identity`);
      assert.equal(emittedFlat[name], emittedGroup[name], `${name} emitted identity`);
    }
  }
});
