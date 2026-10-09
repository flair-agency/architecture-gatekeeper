import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = path.join(repositoryRoot, 'scripts/check-source-cycles.mjs');

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'source-cycles-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'scripts'), { recursive: true });
  await mkdir(path.join(directory, 'src'), { recursive: true });
  await mkdir(path.join(directory, 'node_modules'), { recursive: true });
  await symlink(path.join(repositoryRoot, 'node_modules/acorn'), path.join(directory, 'node_modules/acorn'), 'dir');
  await symlink(path.join(repositoryRoot, 'node_modules/typescript'), path.join(directory, 'node_modules/typescript'), 'dir');
  await copyFile(checker, path.join(directory, 'scripts/check-source-cycles.mjs'));
  return directory;
}

async function source(root, relative, contents) {
  const file = path.join(root, 'src', relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

async function authored(root, relative, contents) {
  const file = path.join(root, 'src', relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

function run(root, { args: extraArgs = [] } = {}) {
  const fixtureChecker = path.join(root, 'scripts/check-source-cycles.mjs');
  const args = [fixtureChecker, ...extraArgs];
  return spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
}

test('accepts acyclic and disconnected static relative import graphs', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', "import './nested/b.mjs'; export const a = true;");
  await source(root, 'nested/b.mjs', 'export const b = true;');
  await source(root, 'isolated.mjs', 'export default 42;');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 3 runtime \.mjs and 0 authored \.mts modules; no static relative dependency cycles\./);
});

test('reports direct, indirect, and self cycles as readable deterministic chains', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', "import './b.mjs'; import './a.mjs';");
  await source(root, 'b.mjs', "import './a.mjs'; import './c.mjs';");
  await source(root, 'c.mjs', "import './b.mjs';");
  const first = run(root);
  const second = run(root);
  assert.equal(first.status, 1);
  assert.equal(first.stderr, second.stderr);
  assert.match(first.stderr, /cycle: a\.mjs -> a\.mjs/);
  assert.match(first.stderr, /cycle: a\.mjs -> b\.mjs -> a\.mjs/);
  assert.match(first.stderr, /cycle: b\.mjs -> c\.mjs -> b\.mjs/);
});

test('reports a three-module indirect cycle', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', "import './b.mjs';");
  await source(root, 'b.mjs', "import './c.mjs';");
  await source(root, 'c.mjs', "import './a.mjs';");
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cycle: a\.mjs -> b\.mjs -> c\.mjs -> a\.mjs/);
});

test('treats re-exports as static graph edges', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', "export { value } from './b.mjs';");
  await source(root, 'b.mjs', "export { value } from './a.mjs';");
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cycle: a\.mjs -> b\.mjs -> a\.mjs/);
});

test('ignores import-like text, regex, templates, builtins, bare packages, and dynamic imports', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', String.raw`// import './comment.mjs';
const text = "import './string.mjs'";
const expression = /import\s+['"]\.\/regex\.mjs['"]/;
const template = ` + '`' + String.raw`import './template.mjs' ${'${' + '"x"' + '}'}` + '`' + String.raw`;
import 'node:fs';
import 'pkg';
import('./dynamic.mjs');
export { text, expression, template };`);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 1 runtime \.mjs and 0 authored \.mts modules/);
});

test('fails closed for missing, escaping, unsupported, and symlinked relative targets', async t => {
  const missing = await fixture(t);
  await source(missing, 'a.mjs', "import './absent.mjs';");
  const missingResult = run(missing);
  assert.equal(missingResult.status, 1);
  assert.match(missingResult.stderr, /missing relative \.mjs import target/);

  const escaping = await fixture(t);
  await source(escaping, 'a.mjs', "import '../outside.mjs';");
  const escapingResult = run(escaping);
  assert.equal(escapingResult.status, 1);
  assert.match(escapingResult.stderr, /escapes source root/);

  const unsupported = await fixture(t);
  await source(unsupported, 'a.mjs', "import './target.js';");
  const unsupportedResult = run(unsupported);
  assert.equal(unsupportedResult.status, 1);
  assert.match(unsupportedResult.stderr, /only \.mjs or \.mts specifiers are checked/);

  const linked = await fixture(t);
  const outside = await source(linked, 'outside.mjs', 'export {};');
  await symlink(outside, path.join(linked, 'src/linked.mjs'));
  await source(linked, 'a.mjs', "import './linked.mjs';");
  const linkedResult = run(linked);
  assert.equal(linkedResult.status, 1);
  assert.match(linkedResult.stderr, /symbolic link is not supported/);
});

test('rejects unsupported JavaScript and TypeScript source files instead of claiming complete coverage', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', 'export {};');
  await source(root, 'future.ts', 'export const future = true;');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /checker covers \.mjs and \.mts only/);
});

test('parses without executing module bodies and reports syntax errors with file context', async t => {
  const root = await fixture(t);
  const marker = path.join(root, 'executed');
  await source(root, 'throws.mjs', `import { writeFileSync } from 'node:fs'; throw new Error('must not execute'); writeFileSync(${JSON.stringify(marker)}, 'bad');`);
  const accepted = run(root);
  assert.equal(accepted.status, 0, accepted.stderr);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });

  await source(root, 'invalid.mjs', 'export const = ;');
  const invalid = run(root);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /cannot parse invalid\.mjs/);
});

test('includes import-attribute declarations in the static graph', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', "import './b.mjs' with { type: 'javascript' };");
  await source(root, 'b.mjs', "export * from './a.mjs';");
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cycle: a\.mjs -> b\.mjs -> a\.mjs/);
});

test('rejects caller-selected roots and keeps the scan pinned to its checkout', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', 'export {};');
  const outside = path.join(os.tmpdir(), 'untrusted-src-root');
  const result = run(root, { args: [outside] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: node scripts\/check-source-cycles\.mjs/);
  assert.doesNotMatch(result.stdout, /no static relative import cycles/);
});

test('checks authored .mts dependencies and maps emitted .mjs specifiers to typed peers', async t => {
  const root = await fixture(t);
  await authored(root, 'a.mts', "import { b } from './b.mjs'; export const a = b;");
  await authored(root, 'b.mts', 'export const b = true;');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 0 runtime \.mjs and 2 authored \.mts modules/);
});

test('detects deep cycles through typed peer fallback and physical TypeScript references', async t => {
  for (const suffix of ['mjs', 'mts']) {
    const root = await fixture(t);
    await authored(root, 'a.mts', `import './b.${suffix}';`);
    await authored(root, 'b.mts', `import './c.${suffix}';`);
    await authored(root, 'c.mts', `import './a.${suffix}';`);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cycle: a\.mjs -> b\.mjs -> c\.mjs -> a\.mjs/);
  }
});

test('merges authored dependencies with emitted runtime edges for compiled peers', async t => {
  for (const suffix of ['mjs', 'mts']) {
    const root = await fixture(t);
    await authored(root, 'typed.mts', "import './legacy.mjs';");
    await source(root, 'legacy.mjs', "import './facade.mjs';");
    await source(root, 'facade.mjs', `import './typed.${suffix}';`);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cycle: facade\.mjs -> typed\.mjs -> legacy\.mjs -> facade\.mjs/);
  }
});

test('allows type-only import and export dependencies without adding runtime graph edges', async t => {
  for (const suffix of ['mjs', 'mts']) {
    const root = await fixture(t);
    await authored(root, 'a.mts', `import type { B } from './b.${suffix}'; export type { C } from './b.${suffix}'; export { type A } from './b.${suffix}'; export const a: B = {} as C;`);
    await authored(root, 'b.mts', `import type { A } from './a.${suffix}'; export type { A };`);
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('fails closed for missing authored peers, unsupported module forms, and invalid TypeScript', async t => {
  const missing = await fixture(t);
  await authored(missing, 'a.mts', "import './absent.mjs';");
  const missingResult = run(missing);
  assert.equal(missingResult.status, 1);
  assert.match(missingResult.stderr, /missing relative \.mjs import target/);

  const missingTyped = await fixture(t);
  await authored(missingTyped, 'a.mts', "import './absent.mts';");
  await source(missingTyped, 'absent.mjs', 'export {};');
  const missingTypedResult = run(missingTyped);
  assert.equal(missingTypedResult.status, 1);
  assert.match(missingTypedResult.stderr, /missing relative \.mts import target/);

  const unsupported = await fixture(t);
  await authored(unsupported, 'a.mts', "import './b.js';");
  const unsupportedResult = run(unsupported);
  assert.equal(unsupportedResult.status, 1);
  assert.match(unsupportedResult.stderr, /only \.mjs or \.mts specifiers are checked/);

  const importEquals = await fixture(t);
  await authored(importEquals, 'a.mts', "import b = require('./b.mjs');");
  const importEqualsResult = run(importEquals);
  assert.equal(importEqualsResult.status, 1);
  assert.match(importEqualsResult.stderr, /unsupported import-equals declaration/);

  const invalid = await fixture(t);
  await authored(invalid, 'a.mts', 'export const = ;');
  const invalidResult = run(invalid);
  assert.equal(invalidResult.status, 1);
  assert.match(invalidResult.stderr, /cannot parse a\.mjs/);
});

test('rejects unsupported source suffixes and duplicate source/output identities', async t => {
  const root = await fixture(t);
  await authored(root, 'future.ts', 'export const future = true;');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported source file extension/);

  const jsLike = await fixture(t);
  await source(jsLike, 'future.js', 'export {};');
  const jsLikeResult = run(jsLike);
  assert.equal(jsLikeResult.status, 1);
  assert.match(jsLikeResult.stderr, /unsupported source file extension/);

  const duplicate = await fixture(t);
  await source(duplicate, 'same.mjs', 'export {};');
  await authored(duplicate, 'same.mts', 'export {};');
  const duplicateResult = run(duplicate);
  assert.equal(duplicateResult.status, 1);
  assert.match(duplicateResult.stderr, /duplicate authored\/runtime module path/);
});

test('rejects authored imports that escape the fixed roots or traverse symbolic links', async t => {
  const escaping = await fixture(t);
  await authored(escaping, 'a.mts', "import '../outside.mts';");
  const escapeResult = run(escaping);
  assert.equal(escapeResult.status, 1);
  assert.match(escapeResult.stderr, /escapes source root/);

  const linked = await fixture(t);
  const outside = path.join(linked, 'outside.mts');
  await writeFile(outside, 'export {};');
  await symlink(outside, path.join(linked, 'src/linked.mts'));
  await authored(linked, 'a.mts', "import './linked.mts';");
  const linkResult = run(linked);
  assert.equal(linkResult.status, 1);
  assert.match(linkResult.stderr, /symbolic link is not supported/);
});
