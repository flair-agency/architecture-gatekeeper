import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function runBuild(fixtureRoot) {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(result.error, undefined, `compiler process must exit without spawn error: ${result.error?.message}`);
  assert.equal(result.signal, null, 'compiler process must exit without being signaled');
  return result;
}

function emittedFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? emittedFiles(path).map(file => `${entry.name}/${file}`) : [entry.name];
  }).sort();
}

test('standard tsc build cleans only dist, copies legacy JavaScript, and emits mixed source paths', { timeout: 240_000 }, t => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'architecture-gatekeeper-typescript-build-'));
  const externalRoot = mkdtempSync(join(tmpdir(), 'architecture-gatekeeper-typescript-external-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  t.after(() => rmSync(externalRoot, { recursive: true, force: true }));
  mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
  cpSync(join(root, 'scripts/clean-dist.mjs'), join(fixtureRoot, 'scripts/clean-dist.mjs'));
  cpSync(join(root, 'tsconfig.json'), join(fixtureRoot, 'tsconfig.json'));
  cpSync(join(root, 'package.json'), join(fixtureRoot, 'package.json'));
  mkdirSync(join(fixtureRoot, 'src/owner-addition'), { recursive: true });
  cpSync(join(root, 'src/owner-addition/owner-addition-validation.mts'), join(fixtureRoot, 'src/owner-addition/owner-addition-validation.mts'));
  cpSync(join(root, 'src/owner-addition-validation.mjs'), join(fixtureRoot, 'src/owner-addition-validation.mjs'));
  mkdirSync(join(fixtureRoot, 'src/ci-execution'), { recursive: true });
  cpSync(join(root, 'src/ci-execution/ci-execution-result.mts'), join(fixtureRoot, 'src/ci-execution/ci-execution-result.mts'));
  cpSync(join(root, 'src/ci-execution-result.mjs'), join(fixtureRoot, 'src/ci-execution-result.mjs'));
  mkdirSync(join(fixtureRoot, 'src/owner-amendment'), { recursive: true });
  cpSync(join(root, 'src/owner-amendment/owner-amendment-tag-readback.mts'), join(fixtureRoot, 'src/owner-amendment/owner-amendment-tag-readback.mts'));
  cpSync(join(root, 'src/owner-amendment-tag-readback.mjs'), join(fixtureRoot, 'src/owner-amendment-tag-readback.mjs'));
  for (const module of ['owner-amendment-tag-api', 'owner-amendment-tag-attempt',
    'owner-amendment-semantic-tag-object', 'owner-amendment-artifact',
    'owner-amendment-artifact-discovery', 'owner-amendment-attestation', 'owner-amendment-artifact-zip',
    'owner-amendment-handoff-pr-run-context', 'owner-amendment-workflow-run-merge-group-context', 'owner-amendment-scope']) {
    cpSync(join(root, `src/owner-amendment/${module}.mts`), join(fixtureRoot, `src/owner-amendment/${module}.mts`));
    cpSync(join(root, `src/${module}.mjs`), join(fixtureRoot, `src/${module}.mjs`));
  }
  mkdirSync(join(fixtureRoot, 'src/github'), { recursive: true });
  for (const module of ['github-associated-repository', 'github-cli-runner',
    'github-authority-source', 'github-merge-group-event', 'github-owner-amendment-readback']) {
    cpSync(join(root, `src/github/${module}.mts`), join(fixtureRoot, `src/github/${module}.mts`));
    cpSync(join(root, `src/${module}.mjs`), join(fixtureRoot, `src/${module}.mjs`));
  }
  for (const module of ['runner-temp-path', 'github-runner-env', 'resolve-ci-policy', 'authority-set']) {
    cpSync(join(root, `src/${module}.mjs`), join(fixtureRoot, `src/${module}.mjs`));
  }
  writeFileSync(join(fixtureRoot, 'src/legacy.mjs'), 'export const legacyValue = 7;\n');
  writeFileSync(join(fixtureRoot, 'src/owner-addition/peer.mts'), "import { legacyValue } from '../legacy.mjs';\nexport const answer: number = legacyValue + 35;\n");
  symlinkSync(join(root, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');

  const dist = join(fixtureRoot, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'stale.mjs'), 'old artifact\n');
  const initialBuild = runBuild(fixtureRoot);
  assert.equal(initialBuild.status, 0, initialBuild.stderr);
  assert.deepEqual(emittedFiles(dist), [
    'authority-set.mjs',
    'ci-execution-result.mjs',
    'ci-execution/ci-execution-result.mjs',
    'github-associated-repository.mjs',
    'github-authority-source.mjs',
    'github-cli-runner.mjs',
    'github-merge-group-event.mjs',
    'github-owner-amendment-readback.mjs',
    'github-runner-env.mjs',
    'github/github-associated-repository.mjs',
    'github/github-authority-source.mjs',
    'github/github-cli-runner.mjs',
    'github/github-merge-group-event.mjs',
    'github/github-owner-amendment-readback.mjs',
    'legacy.mjs',
    'owner-addition-validation.mjs',
    'owner-addition/owner-addition-validation.mjs',
    'owner-addition/peer.mjs',
    'owner-amendment-artifact-discovery.mjs',
    'owner-amendment-artifact-zip.mjs',
    'owner-amendment-artifact.mjs',
    'owner-amendment-attestation.mjs',
    'owner-amendment-handoff-pr-run-context.mjs',
    'owner-amendment-scope.mjs',
    'owner-amendment-semantic-tag-object.mjs',
    'owner-amendment-tag-api.mjs',
    'owner-amendment-tag-attempt.mjs',
    'owner-amendment-tag-readback.mjs',
    'owner-amendment-workflow-run-merge-group-context.mjs',
    'owner-amendment/owner-amendment-artifact-discovery.mjs',
    'owner-amendment/owner-amendment-artifact-zip.mjs',
    'owner-amendment/owner-amendment-artifact.mjs',
    'owner-amendment/owner-amendment-attestation.mjs',
    'owner-amendment/owner-amendment-handoff-pr-run-context.mjs',
    'owner-amendment/owner-amendment-scope.mjs',
    'owner-amendment/owner-amendment-semantic-tag-object.mjs',
    'owner-amendment/owner-amendment-tag-api.mjs',
    'owner-amendment/owner-amendment-tag-attempt.mjs',
    'owner-amendment/owner-amendment-tag-readback.mjs',
    'owner-amendment/owner-amendment-workflow-run-merge-group-context.mjs',
    'resolve-ci-policy.mjs',
    'runner-temp-path.mjs',
  ]);
  assert.equal(readFileSync(join(dist, 'legacy.mjs'), 'utf8'), 'export const legacyValue = 7;\n');
  assert.match(readFileSync(join(dist, 'owner-addition-validation.mjs'), 'utf8'), /from '\.\/owner-addition\/owner-addition-validation\.mjs'/);
  assert.match(readFileSync(join(dist, 'ci-execution-result.mjs'), 'utf8'), /from '\.\/ci-execution\/ci-execution-result\.mjs'/);
  assert.match(readFileSync(join(dist, 'ci-execution/ci-execution-result.mjs'), 'utf8'), /export function normalizeCiExecutionResult/);
  assert.match(readFileSync(join(dist, 'owner-amendment-tag-readback.mjs'), 'utf8'), /from '\.\/owner-amendment\/owner-amendment-tag-readback\.mjs'/);
  assert.match(readFileSync(join(dist, 'owner-amendment/owner-amendment-tag-readback.mjs'), 'utf8'), /export async function readOwnerAmendmentTagForMergeGroup/);
  assert.doesNotMatch(emittedFiles(dist).join('\n'), /stale/);
  assert.equal(runBuild(fixtureRoot).status, 0, 'a second clean build should be deterministic');

  writeFileSync(join(fixtureRoot, 'src/owner-addition/peer.mts'), 'export const deliberateTypeError: string = 1;\n');
  const failedCompile = runBuild(fixtureRoot);
  assert.notEqual(failedCompile.status, 0);
  assert.match(`${failedCompile.stdout}${failedCompile.stderr}`, /Type 'number' is not assignable to type 'string'/);
  assert.equal(existsSync(dist), false, 'failed compilation must not leave usable output from the previous successful build');

  rmSync(dist, { recursive: true, force: true });
  const externalDirectory = join(externalRoot, 'dist-target');
  mkdirSync(externalDirectory);
  const externalSentinel = join(externalDirectory, 'sentinel');
  writeFileSync(externalSentinel, 'outside sentinel\n');
  symlinkSync(externalDirectory, dist, 'dir');
  const linkedBuild = runBuild(fixtureRoot);
  assert.notEqual(linkedBuild.status, 0);
  assert.match(linkedBuild.stderr, /dist must be a real directory/);
  assert.equal(readFileSync(externalSentinel, 'utf8'), 'outside sentinel\n');
  rmSync(dist);

  mkdirSync(dist);
  const linkedEntry = join(dist, 'linked.mjs');
  symlinkSync(externalSentinel, linkedEntry);
  const nestedLinkBuild = runBuild(fixtureRoot);
  assert.notEqual(nestedLinkBuild.status, 0);
  assert.match(nestedLinkBuild.stderr, /Refusing to clean symbolic link in dist/);
  assert.equal(readFileSync(externalSentinel, 'utf8'), 'outside sentinel\n');
  rmSync(linkedEntry);

  writeFileSync(join(dist, 'hardlinked.mjs'), 'hardlink sentinel\n');
  const externalHardlink = join(externalRoot, 'hardlinked.mjs');
  linkSync(join(dist, 'hardlinked.mjs'), externalHardlink);
  const hardlinkBuild = runBuild(fixtureRoot);
  assert.notEqual(hardlinkBuild.status, 0);
  assert.match(hardlinkBuild.stderr, /Refusing to clean hard-linked dist file/);
  assert.equal(readFileSync(externalHardlink, 'utf8'), 'hardlink sentinel\n');
});
