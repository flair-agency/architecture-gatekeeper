import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';
import { parse } from 'acorn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/github-owner-addition-provenance-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined);
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, []);
assert.equal(tsconfig.options.strict, true);
assert.equal(tsconfig.options.noImplicitAny, true);
assert.equal(tsconfig.options.noEmitOnError, true);

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], { ...tsconfig.options, rootDir: root, noEmit: true },
  'all imported implementations must be error-free');

function diagnosticsFor(fixture) {
  const file = join(fixtureRoot, fixture);
  return diagnosticsForFixture(file).map(diagnostic => ({
    code: diagnostic.code,
    line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

test('provenance contract preserves unknown observations and awaited fetch collaboration', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('provenance contract rejects missing selection, invalid fetch, acceptance and unchecked observations', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]),
    [[2345, 4], [2322, 5], [2322, 6], [2322, 7], [2322, 8], [2540, 9], [2339, 10]]);
  const messages = [
    /missing the following properties.*githubToken, repository, targetBranch, pullRequestNumber/s,
    /string.*not assignable.*number/s,
    /verified.*not assignable.*accepted/s,
    /unknown.*not assignable.*string/s,
    /unknown.*not assignable.*string/s,
    /attempt.*read-only property/s,
    /push.*does not exist.*readonly unknown\[\]/s,
  ];
  for (const [index, expression] of messages.entries()) assert.match(diagnostics[index].message, expression);
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}

function body(source, includeImports = false) {
  return canonical(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body
    .filter(node => includeImports || node.type !== 'ImportDeclaration'));
}

test('complete typed provenance implementation preserves original operations and flat function identity', async () => {
  const path = join(root, 'src/github/github-owner-addition-provenance.mts');
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: tsconfig.options, fileName: path,
  });
  // 1054d1ba:src/github-owner-addition-provenance.mjs; erase only types and
  // import declarations, normalizing coordinates and literal spelling.
  const baseline = '3b6faaaaf990c2d2e7ac05ae6fd4e08bbf94fee1300e728cb2aa5e4fb11f40bd';
  for (const source of [compiled.outputText,
    readFileSync(join(root, 'dist/github/github-owner-addition-provenance.mjs'), 'utf8')]) {
    assert.equal(createHash('sha256').update(JSON.stringify(body(source))).digest('hex'), baseline);
  }
  const facade = "export { verifyOwnerAdditionEligibilityProvenance } from './github/github-owner-addition-provenance.mjs';";
  assert.deepEqual(body(readFileSync(join(root, 'src/github-owner-addition-provenance.mjs'), 'utf8')
    .replace("'./github/github-owner-addition-provenance.mts'", "'./github/github-owner-addition-provenance.mjs'"), true), body(facade, true));
  assert.deepEqual(body(readFileSync(join(root, 'dist/github-owner-addition-provenance.mjs'), 'utf8'), true), body(facade, true));
  const flat = await import('../dist/github-owner-addition-provenance.mjs');
  const grouped = await import('../dist/github/github-owner-addition-provenance.mjs');
  assert.equal(flat.verifyOwnerAdditionEligibilityProvenance, grouped.verifyOwnerAdditionEligibilityProvenance);
});
