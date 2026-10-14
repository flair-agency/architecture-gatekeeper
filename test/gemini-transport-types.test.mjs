import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';
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

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], compilerOptions);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file), [],
    'the transport and all imported source modules must remain strict-error-free');
  return diagnostics.filter(item => item.file?.fileName === file).map(item => ({ code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, '\n'), line: item.file.getLineAndCharacterOfPosition(item.start).line + 1 }));
}

function astDigest(source) {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
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

const expectedOriginalAst = '711fde08311a6c33889c5de0bae979a835a0cb6781b0821a335b871e2530c60f';
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

test('Gemini transport source and emitted operations retain the complete adopted JavaScript AST', () => {
  const emitted = readFileSync(emittedPath, 'utf8');
  assert.equal(astDigest(sourceJavaScript), expectedOriginalAst, 'type erasure must preserve original imports, exports, and operations');
  assert.equal(astDigest(emitted), expectedOriginalAst, 'build output must retain the adopted operations');
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
