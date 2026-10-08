import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = path.join(repositoryRoot, 'scripts/check-source-cycles.mjs');

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'source-cycles-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function source(root, relative, contents) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

function run(root, { flag = true } = {}) {
  const args = [...(flag ? ['--experimental-vm-modules'] : []), checker, root];
  return spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 5000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
}

test('accepts acyclic and disconnected static relative import graphs', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', "import './nested/b.mjs'; export const a = true;");
  await source(root, 'nested/b.mjs', 'export const b = true;');
  await source(root, 'isolated.mjs', 'export default 42;');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked 3 \.mjs modules; no static relative import cycles\./);
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
  assert.match(result.stdout, /Checked 1 \.mjs modules/);
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
  assert.match(unsupportedResult.stderr, /only \.mjs targets are checked/);

  const linked = await fixture(t);
  const outside = await source(linked, 'outside.mjs', 'export {};');
  await symlink(outside, path.join(linked, 'linked.mjs'));
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
  assert.match(result.stderr, /checker covers \.mjs only/);
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

test('explains the required VM modules flag when it is absent', async t => {
  const root = await fixture(t);
  await source(root, 'a.mjs', 'export {};');
  const result = run(root, { flag: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SourceTextModule is unavailable/);
  assert.match(result.stderr, /--experimental-vm-modules/);
});
