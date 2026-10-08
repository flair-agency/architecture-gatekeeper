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
  const secondOutputPath = join(fixtureRoot, 'src/ci-execution/ci-execution-result.mjs');
  const thirdOutputPath = join(fixtureRoot, 'src/owner-amendment/owner-amendment-tag-readback.mjs');
  const missingCheck = runBuild(fixtureRoot, '--check');
  assert.notEqual(missingCheck.status, 0);
  assert.match(missingCheck.stderr, /Generated output is missing or stale/);

  const initialBuild = runBuild(fixtureRoot);
  assert.equal(initialBuild.status, 0, initialBuild.stderr);
  const baselineOutput = readFileSync(outputPath, 'utf8');
  const secondBaselineOutput = readFileSync(secondOutputPath, 'utf8');
  const thirdBaselineOutput = readFileSync(thirdOutputPath, 'utf8');
  assert.equal(runBuild(fixtureRoot, '--check').status, 0);

  rmSync(secondOutputPath);
  const secondMissingCheck = runBuild(fixtureRoot, '--check');
  assert.notEqual(secondMissingCheck.status, 0);
  assert.match(secondMissingCheck.stderr, /Generated output is missing or stale: src\/ci-execution\/ci-execution-result\.mjs/);
  assert.equal(runBuild(fixtureRoot).status, 0);
  assert.equal(readFileSync(secondOutputPath, 'utf8'), secondBaselineOutput);

  writeFileSync(secondOutputPath, `${secondBaselineOutput}\n// stale fixture output\n`);
  const secondStaleCheck = runBuild(fixtureRoot, '--check');
  assert.notEqual(secondStaleCheck.status, 0);
  assert.match(secondStaleCheck.stderr, /Generated output is missing or stale: src\/ci-execution\/ci-execution-result\.mjs/);
  assert.equal(runBuild(fixtureRoot).status, 0);
  assert.equal(readFileSync(secondOutputPath, 'utf8'), secondBaselineOutput);

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

  const secondExtraOutputPath = join(fixtureRoot, 'src/ci-execution/nested/unmapped.mjs');
  mkdirSync(dirname(secondExtraOutputPath), { recursive: true });
  writeFileSync(secondExtraOutputPath, 'export {};\n');
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected generated \.mjs output: src\/ci-execution\/nested\/unmapped\.mjs/);
  }
  assert.equal(readFileSync(outputPath, 'utf8'), baselineOutput, 'second managed directory extra output must stop all generation');
  assert.equal(readFileSync(secondOutputPath, 'utf8'), secondBaselineOutput, 'second managed output must remain untouched');
  rmSync(dirname(secondExtraOutputPath), { recursive: true, force: true });

  const thirdExtraOutputPath = join(fixtureRoot, 'src/owner-amendment/nested/unmapped.mjs');
  mkdirSync(dirname(thirdExtraOutputPath), { recursive: true });
  writeFileSync(thirdExtraOutputPath, 'export {};\n');
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected generated \.mjs output: src\/owner-amendment\/nested\/unmapped\.mjs/);
  }
  assert.equal(readFileSync(outputPath, 'utf8'), baselineOutput, 'third managed directory extra output must stop all generation');
  assert.equal(readFileSync(secondOutputPath, 'utf8'), secondBaselineOutput, 'existing managed output must remain untouched');
  assert.equal(readFileSync(thirdOutputPath, 'utf8'), thirdBaselineOutput, 'tag readback managed output must remain untouched');
  rmSync(dirname(thirdExtraOutputPath), { recursive: true, force: true });

  const sourcePath = join(fixtureRoot, 'src-ts/owner-addition/owner-addition-validation.mts');
  const source = readFileSync(sourcePath, 'utf8');
  writeFileSync(sourcePath, `${source}\nconst deliberateTypeError: string = 1;\n`);
  const failedCompile = runBuild(fixtureRoot);
  assert.notEqual(failedCompile.status, 0);
  assert.match(failedCompile.stderr, /Type 'number' is not assignable to type 'string'/);
  assert.equal(readFileSync(outputPath, 'utf8'), baselineOutput, 'compiler errors must not replace generated output');
  assert.equal(readFileSync(secondOutputPath, 'utf8'), secondBaselineOutput, 'compiler errors must not replace the second generated output');
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
    assert.match(result.stderr, /src\/owner-addition/);
    assert.equal(readFileSync(externalSentinel, 'utf8'), 'outside sentinel\n');
  }
  rmSync(join(fixtureRoot, 'src/owner-addition'), { recursive: true, force: true });
  assert.equal(runBuild(fixtureRoot).status, 0);

  const secondExternalDirectory = join(externalRoot, 'second-mapped-output');
  mkdirSync(secondExternalDirectory);
  const secondExternalSentinel = join(secondExternalDirectory, 'ci-execution-result.mjs');
  writeFileSync(secondExternalSentinel, 'second outside sentinel\n');
  rmSync(join(fixtureRoot, 'src/ci-execution'), { recursive: true, force: true });
  symlinkSync(secondExternalDirectory, join(fixtureRoot, 'src/ci-execution'), 'dir');
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symbolic links are not allowed/);
    assert.match(result.stderr, /src\/ci-execution/);
    assert.equal(readFileSync(secondExternalSentinel, 'utf8'), 'second outside sentinel\n');
  }
  rmSync(join(fixtureRoot, 'src/ci-execution'));
  mkdirSync(join(fixtureRoot, 'src/ci-execution'), { recursive: true });
  symlinkSync(secondExternalSentinel, secondOutputPath);
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symbolic links are not allowed/);
    assert.match(result.stderr, /src\/ci-execution\/ci-execution-result\.mjs/);
    assert.equal(readFileSync(secondExternalSentinel, 'utf8'), 'second outside sentinel\n');
  }
  rmSync(secondOutputPath);
  assert.equal(runBuild(fixtureRoot).status, 0);
  const secondExternalHardlink = join(externalRoot, 'second-hard-linked-output.mjs');
  linkSync(secondOutputPath, secondExternalHardlink);
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Hard-linked generated output is not allowed/);
    assert.match(result.stderr, /src\/ci-execution\/ci-execution-result\.mjs/);
    assert.equal(readFileSync(secondExternalHardlink, 'utf8'), secondBaselineOutput);
  }
  rmSync(secondExternalHardlink);

  rmSync(join(fixtureRoot, 'src/owner-addition'), { recursive: true, force: true });
  mkdirSync(join(fixtureRoot, 'src/owner-addition'), { recursive: true });
  symlinkSync(externalSentinel, outputPath);
  for (const args of [['--check'], []]) {
    const result = runBuild(fixtureRoot, ...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symbolic links are not allowed/);
    assert.match(result.stderr, /src\/owner-addition\/owner-addition-validation\.mjs/);
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
    assert.match(result.stderr, /src\/owner-addition\/owner-addition-validation\.mjs/);
    assert.equal(readFileSync(externalHardlink, 'utf8'), baselineOutput);
  }
});
