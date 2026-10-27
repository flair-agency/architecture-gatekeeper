import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';
import * as flat from '../dist/gemini-transport.mjs';
import * as grouped from '../dist/reviewer-transports/gemini-transport.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-transport-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined);
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, []);
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], compilerOptions, 'the transport and all imported source modules must remain strict-error-free');

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  return diagnosticsForFixture(file).map(item => ({ code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, '\n'), line: item.file.getLineAndCharacterOfPosition(item.start).line + 1 }));
}

function astDigest(source, unchangedOnly = false) {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  if (unchangedOnly) {
    tree.body = tree.body.filter(node => !['executeGeminiReviewer', 'prepareGeminiDispatch', 'decodeGeminiDecision']
      .includes((node.type === 'ExportNamedDeclaration' ? node.declaration : node)?.id?.name));
  }
  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue;
      if (key === 'attributes' && Array.isArray(value[key]) && value[key].length === 0) continue;
      result[key] = normalize(value[key]);
    }
    return result;
  }
  return createHash('sha256').update(JSON.stringify(normalize(tree))).digest('hex');
}

// Derived offline from the exact e7a baseline in /tmp/issue-648-baseline.
// Execution orchestration and its new phase helpers are covered by runtime regressions.
const expectedUnchangedAst = '554d4c2dfa925648d86063145147e884cea7a3f84f6750cf966d8c9fd3ad003a';
const sourcePath = join(root, 'src/reviewer-transports/gemini-transport.mts');
const emittedPath = join(root, 'dist/reviewer-transports/gemini-transport.mjs');
const sourceJavaScript = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  fileName: 'gemini-transport.mts',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, rewriteRelativeImportExtensions: true },
}).outputText;
const publicExports = [
  'cleanJsonSchema', 'executeGeminiReviewer', 'getSupportedEnvironmentCredentialValues',
  'mapEffortToThinkingBudget', 'prepareGeminiRequestBody', 'resolveAuthCredentials',
  'resolveBaseUrl', 'resolveGcloudAccessToken', 'resolveReviewerThinkingBudget',
  'resolveVertexProject', 'resolveVertexRegion', 'runGeminiReviewer', 'validateThinkingBudget',
];

test('Gemini transport preserves unchanged migration operations and complete source/emitted equivalence', () => {
  const emitted = readFileSync(emittedPath, 'utf8');
  assert.equal(astDigest(sourceJavaScript, true), expectedUnchangedAst, 'unchanged adopted operations retain the immutable baseline');
  assert.equal(astDigest(emitted, true), expectedUnchangedAst, 'build output retains unchanged adopted operations');
  assert.equal(astDigest(sourceJavaScript), astDigest(emitted), 'authored and built operation trees must match');
});

test('Gemini transport flat exports preserve the grouped function identities', () => {
  assert.deepEqual(Object.keys(flat).sort(), [...publicExports].sort());
  assert.deepEqual(Object.keys(grouped).sort(), [...publicExports].sort());
  for (const name of publicExports) assert.strictEqual(flat[name], grouped[name], `${name} must be a direct re-export`);
});

test('Gemini transport request, unknown response, and callback contracts compile', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
  assert.deepEqual(diagnosticsFor('negative.mts'), [], 'each deliberate negative probe must reject its unsupported contract');
});
