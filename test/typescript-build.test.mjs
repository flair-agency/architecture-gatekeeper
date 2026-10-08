import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function runBuild(fixtureRoot, ...args) {
  const result = spawnSync(process.execPath, ['scripts/build-typescript.mjs', ...args], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(result.error, undefined, `compiler process must exit without spawn error: ${result.error?.message}`);
  assert.equal(result.signal, null, 'compiler process must exit without being signaled');
  return result;
}

test('TypeScript build checks missing, stale, extra, symlinked, and failed-emission paths in an isolated checkout', { timeout: 240_000 }, t => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'architecture-gatekeeper-typescript-build-'));
  const externalRoot = mkdtempSync(join(tmpdir(), 'architecture-gatekeeper-typescript-external-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  t.after(() => rmSync(externalRoot, { recursive: true, force: true }));
  mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
  cpSync(join(root, 'scripts/build-typescript.mjs'), join(fixtureRoot, 'scripts/build-typescript.mjs'), { recursive: true });
  cpSync(join(root, 'tsconfig.json'), join(fixtureRoot, 'tsconfig.json'));
  cpSync(join(root, 'src-ts'), join(fixtureRoot, 'src-ts'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src'));
  symlinkSync(join(root, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');

  const outputPath = join(fixtureRoot, 'src/owner-addition/owner-addition-validation.mjs');
  const missingCheck = runBuild(fixtureRoot, '--check');
  assert.notEqual(missingCheck.status, 0);
  assert.match(missingCheck.stderr, /Generated output is missing or stale/);

  const initialBuild = runBuild(fixtureRoot);
  assert.equal(initialBuild.status, 0, initialBuild.stderr);
  const baselineOutput = readFileSync(outputPath, 'utf8');
  assert.equal(runBuild(fixtureRoot, '--check').status, 0);

  writeFileSync(outputPath, `${baselineOutput}\n// stale fixture output\n`);
  const staleCheck = runBuild(fixtureRoot, '--check');
  assert.notEqual(staleCheck.status, 0);
  assert.match(staleCheck.stderr, /Generated output is missing or stale/);
  assert.equal(runBuild(fixtureRoot).status, 0, 'build should refresh a stale mapped output');

  const externalSource = join(externalRoot, 'outside.mts');
  writeFileSync(externalSource, 'throw new Error("must not read through symlink");\n');
  const linkedSource = join(fixtureRoot, 'src-ts/owner-addition/linked.mts');
  symlinkSync(externalSource, linkedSource);
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symbolic links are not allowed/);
    assert.equal(readFileSync(externalSource, 'utf8'), 'throw new Error("must not read through symlink");\n');
  }
  rmSync(linkedSource);

  const extraOutputPath = join(fixtureRoot, 'src/owner-addition/nested/unmapped.mjs');
  mkdirSync(dirname(extraOutputPath), { recursive: true });
  writeFileSync(extraOutputPath, 'export {};\n');
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected generated \.mjs output: src\/owner-addition\/nested\/unmapped\.mjs/);
  }
  assert.equal(readFileSync(outputPath, 'utf8'), baselineOutput, 'extra output must stop generation before writing');
  rmSync(dirname(extraOutputPath), { recursive: true, force: true });

  const sourcePath = join(fixtureRoot, 'src-ts/owner-addition/owner-addition-validation.mts');
  const source = readFileSync(sourcePath, 'utf8');
  writeFileSync(sourcePath, `${source}\nconst deliberateTypeError: string = 1;\n`);
  const failedCompile = runBuild(fixtureRoot);
  assert.notEqual(failedCompile.status, 0);
  assert.match(failedCompile.stderr, /Type 'number' is not assignable to type 'string'/);
  assert.equal(readFileSync(outputPath, 'utf8'), baselineOutput, 'compiler errors must not replace generated output');
  writeFileSync(sourcePath, source);

  const externalDirectory = join(externalRoot, 'mapped-output');
  mkdirSync(externalDirectory);
  const externalSentinel = join(externalDirectory, 'owner-addition-validation.mjs');
  writeFileSync(externalSentinel, 'outside sentinel\n');
  rmSync(join(fixtureRoot, 'src/owner-addition'), { recursive: true, force: true });
  symlinkSync(externalDirectory, join(fixtureRoot, 'src/owner-addition'), 'dir');
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symbolic links are not allowed/);
    assert.equal(readFileSync(externalSentinel, 'utf8'), 'outside sentinel\n');
  }

  rmSync(join(fixtureRoot, 'src/owner-addition'));
  mkdirSync(join(fixtureRoot, 'src/owner-addition'), { recursive: true });
  symlinkSync(externalSentinel, outputPath);
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symbolic links are not allowed/);
    assert.equal(readFileSync(externalSentinel, 'utf8'), 'outside sentinel\n');
  }

  rmSync(outputPath);
  assert.equal(runBuild(fixtureRoot).status, 0);
  const externalHardlink = join(externalRoot, 'hard-linked-output.mjs');
  linkSync(outputPath, externalHardlink);
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Hard-linked generated output is not allowed/);
    assert.equal(readFileSync(externalHardlink, 'utf8'), baselineOutput);
  }
});
