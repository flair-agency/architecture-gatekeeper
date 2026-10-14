import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { parse } from 'acorn';
import ts from 'typescript';
import { ordinary, decision, fixture, spec, commitOn } from './fixtures/preview-lifecycle-runtime.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-security-proxy-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], { ...parsed.options, rootDir: root, noEmit: true })).map(item => ({
  file: item.file?.fileName,
  code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
}));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'loc', 'range', 'raw'].includes(key))
    .map(([key, child]) => [key, canonical(child)]));
}
function ast(path) {
  const source = readFileSync(path, 'utf8');
  const emitted = path.endsWith('.mts') || path.endsWith('.mjs') && path.includes('/src/')
    ? ts.transpileModule(source, { fileName: path, compilerOptions: parsed.options }).outputText : source;
  return canonical(parse(emitted, { ecmaVersion: 'latest', sourceType: 'module' }).body);
}
function operations(body) {
  return body.filter(node => node.type !== 'ImportDeclaration').map(node =>
    node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node);
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

 test('typed proxy contract accepts existing synchronous and asynchronous reservation results', () => {
  assert.deepEqual(diagnostics.filter(item => item.file === join(fixtureRoot, 'positive.mts')), []);
});
test('typed proxy contract rejects incompatible scopes and callback signatures', () => {
  const negative = diagnostics.filter(item => item.file === join(fixtureRoot, 'negative.mts'));
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [[2322, 5], [2322, 6], [2322, 7]]);
  assert.match(negative[0].message, /apiKey.*not assignable|not assignable.*apiKey/i);
  assert.match(negative[1].message, /Target signature provides too few arguments/);
  assert.match(negative[2].message, /Promise.*not assignable.*string/i);
});
test('complete proxy runtime operations retain adopted AST and flat export identities', async () => {
  const sourceFacade = ast(join(root, 'src/gemini-security-proxy.mjs'));
  const emittedFacade = ast(join(root, 'dist/gemini-security-proxy.mjs'));
  assert.deepEqual(sourceFacade, emittedFacade);
  assert.equal(digest(sourceFacade), 'f7d8bf1792f1954a8e5f1d8198fa35b17d12a1e6711a50251a82438147cdd743');
  const sourceLeaf = ast(join(root, 'src/gemini-cli/gemini-security-proxy.mts'));
  const emittedLeaf = ast(join(root, 'dist/gemini-cli/gemini-security-proxy.mjs'));
  assert.deepEqual(sourceLeaf, emittedLeaf);
  assert.equal(digest(sourceLeaf), 'ce7b9d9c4701845ca973dd351f3e4f95ff31a9a40d380410551236b3293ac443');
  assert.equal(digest(operations(sourceLeaf)), '6711b1e05b314d8c2ed3ac038cd1af1511e495c196d118596d6ee26d4ebd7036');
  assert.deepEqual(sourceLeaf.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value),
    ['node:http', 'node:https', 'node:util']);
  const flat = await import('../dist/gemini-security-proxy.mjs');
  const typed = await import('../dist/gemini-cli/gemini-security-proxy.mjs');
  assert.deepEqual(Object.keys(flat).sort(), ['MAX_PROXY_REQUEST_BYTES', 'remainingDeadlineMs', 'startGeminiSecurityProxy', 'validateGeminiRoute'].sort());
  for (const name of Object.keys(flat)) assert.equal(flat[name], typed[name], name);
  assert.equal(flat.MAX_PROXY_REQUEST_BYTES, 16 * 1024 * 1024);
  assert.deepEqual(['remainingDeadlineMs', 'validateGeminiRoute', 'startGeminiSecurityProxy'].map(name => [flat[name].name, flat[name].length]), [
    ['remainingDeadlineMs', 1], ['validateGeminiRoute', 1], ['startGeminiSecurityProxy', 1],
  ]);
});

for (const kind of ['source', 'emitted']) test(`${kind} runtime identity invalidates stale proxy-module requests and receipts`, async t => {
  const layout = mkdtempSync(join(tmpdir(), `gemini-proxy-${kind}-runtime-`));
  t.after(() => rmSync(layout, { recursive: true, force: true }));
  const treeDir = kind === 'source' ? 'src' : 'dist';
  cpSync(join(root, treeDir), join(layout, treeDir), { recursive: true });
  copyFileSync(join(root, 'package.json'), join(layout, 'package.json'));
  const runtime = await import(pathToFileURL(join(layout, treeDir, 'preview-lifecycle.mjs')).href);
  const f = fixture(t);
  const head = commitOn(f, `proxy-${kind}-identity`, { 'app.txt': `Synthetic ${kind} identity\n` });
  const request = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const relative = `${kind === 'source' ? 'gemini-cli/gemini-security-proxy.mts' : 'gemini-cli/gemini-security-proxy.mjs'}`;
  const identityKey = `gemini-cli/gemini-security-proxy.${kind === 'source' ? 'mts' : 'mjs'}`;
  assert.equal(request.runtime.files[identityKey], createHash('sha256').update(readFileSync(join(layout, treeDir, relative))).digest('hex'));
  const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(receipt, f.root);
  appendFileSync(join(layout, treeDir, relative), '\n// isolated synthetic identity mutation\n');
  const fresh = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  assert.notEqual(fresh.runtime.files[identityKey], request.runtime.files[identityKey]);
  await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root), /request differs from immutable predecessor inputs/);
  await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root), /request differs from immutable predecessor inputs/);
  const freshReceipt = await runtime.completePreviewLifecycle(fresh, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(freshReceipt, f.root);
});
