import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function copyEntrypointModules(fixtureRoot) {
  const pending = [join(root, 'src/native-review.mjs'), join(root, 'src/owner-addition-finalize.mjs')];
  const copied = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (copied.has(path)) continue;
    copied.add(path);
    const destination = join(fixtureRoot, relative(root, path));
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(path, destination);
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const collect = node => {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifier = node.moduleSpecifier.text;
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        specifier = node.argument.literal.text;
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
        specifier = node.arguments[0].text;
      }
      if (specifier?.startsWith('.')) pending.push(resolve(dirname(path), specifier));
      ts.forEachChild(node, collect);
    };
    collect(source);
  }
  return [...copied].map(path => relative(join(root, 'src'), path).replace(/\.mts$/, '.mjs'));
}

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

function reExportTargets(file) {
  return parse(readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' })
    .body.filter(node => node.type === 'ExportNamedDeclaration' && node.source)
    .map(node => node.source.value);
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
    'github-authority-source', 'github-merge-group-event', 'github-owner-amendment-readback',
    'github-owner-addition-readback', 'github-app-check-reporter', 'github-ruleset-readback', 'github-runner-env',
    'github-owner-addition-provenance']) {
    cpSync(join(root, `src/github/${module}.mts`), join(fixtureRoot, `src/github/${module}.mts`));
    cpSync(join(root, `src/${module}.mjs`), join(fixtureRoot, `src/${module}.mjs`));
  }
  for (const module of ['runner-temp-path', 'resolve-ci-policy', 'authority-set']) {
    cpSync(join(root, `src/${module}.mjs`), join(fixtureRoot, `src/${module}.mjs`));
  }
  mkdirSync(join(fixtureRoot, 'src/runner-paths'), { recursive: true });
  cpSync(join(root, 'src/runner-paths/runner-temp-path.mts'), join(fixtureRoot, 'src/runner-paths/runner-temp-path.mts'));
  mkdirSync(join(fixtureRoot, 'src/authority-validation'), { recursive: true });
  cpSync(join(root, 'src/github/owner-addition-evidence-zip.mts'), join(fixtureRoot, 'src/github/owner-addition-evidence-zip.mts'));
  cpSync(join(root, 'src/multi-authority-provenance.mjs'), join(fixtureRoot, 'src/multi-authority-provenance.mjs'));
  cpSync(join(root, 'src/authority-validation/multi-authority-provenance.mts'), join(fixtureRoot, 'src/authority-validation/multi-authority-provenance.mts'));
  cpSync(join(root, 'src/authority-validation/authority-set.mts'), join(fixtureRoot, 'src/authority-validation/authority-set.mts'));
  cpSync(join(root, 'src/authority-validation/resolve-ci-policy.mts'), join(fixtureRoot, 'src/authority-validation/resolve-ci-policy.mts'));
  const entrypointModules = copyEntrypointModules(fixtureRoot);
  writeFileSync(join(fixtureRoot, 'src/legacy.mjs'), 'export const legacyValue = 7;\n');
  writeFileSync(join(fixtureRoot, 'src/owner-addition/peer.mts'), "import { legacyValue } from '../legacy.mjs';\nexport const answer: number = legacyValue + 35;\n");
  symlinkSync(join(root, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');

  const dist = join(fixtureRoot, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'stale.mjs'), 'old artifact\n');
  const initialBuild = runBuild(fixtureRoot);
  assert.equal(initialBuild.status, 0, initialBuild.stderr);
  assert.deepEqual(emittedFiles(dist), [...new Set([
    'authority-set.mjs',
    'authority-validation/authority-set.mjs',
    'authority-validation/multi-authority-provenance.mjs',
    'authority-validation/resolve-ci-policy.mjs',
    'ci-execution-result.mjs',
    'ci-execution/ci-execution-result.mjs',
    'github-app-check-reporter.mjs',
    'github-associated-repository.mjs',
    'github-authority-source.mjs',
    'github-cli-runner.mjs',
    'github-merge-group-event.mjs',
    'github-owner-addition-provenance.mjs',
    'github-owner-addition-readback.mjs',
    'github-owner-amendment-readback.mjs',
    'github-ruleset-readback.mjs',
    'github-runner-env.mjs',
    'github/github-app-check-reporter.mjs',
    'github/github-associated-repository.mjs',
    'github/github-authority-source.mjs',
    'github/github-cli-runner.mjs',
    'github/github-merge-group-event.mjs',
    'github/github-owner-addition-provenance.mjs',
    'github/github-owner-addition-readback.mjs',
    'github/github-owner-amendment-readback.mjs',
    'github/github-ruleset-readback.mjs',
    'github/github-runner-env.mjs',
    'github/owner-addition-evidence-zip.mjs',
    'legacy.mjs',
    'multi-authority-provenance.mjs',
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
    'runner-paths/runner-temp-path.mjs',
    'runner-temp-path.mjs',
    ...entrypointModules,
  ])].sort());
  assert.equal(readFileSync(join(dist, 'legacy.mjs'), 'utf8'), 'export const legacyValue = 7;\n');
  assert.deepEqual(reExportTargets(join(dist, 'owner-addition-validation.mjs')), ['./owner-addition/owner-addition-validation.mjs']);
  assert.deepEqual(reExportTargets(join(dist, 'ci-execution-result.mjs')), ['./ci-execution/ci-execution-result.mjs']);
  assert.match(readFileSync(join(dist, 'ci-execution/ci-execution-result.mjs'), 'utf8'), /export function normalizeCiExecutionResult/);
  assert.deepEqual(reExportTargets(join(dist, 'owner-amendment-tag-readback.mjs')), ['./owner-amendment/owner-amendment-tag-readback.mjs']);
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
