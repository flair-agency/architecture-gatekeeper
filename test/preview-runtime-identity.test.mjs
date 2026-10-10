import assert from 'node:assert/strict';
import { appendFileSync, cpSync, copyFileSync, mkdtempSync, readdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
import '@flair-agency/architecture-gatekeeper/preview-lifecycle';
import { ordinary, decision, fixture, spec, commitOn } from './fixtures/preview-lifecycle-runtime.mjs';

test('runtime identity binds nested emitted modules and invalidates stale requests and receipts', async t => {
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@flair-agency/architecture-gatekeeper/preview-lifecycle'))));
  const runtimeRoot = mkdtempSync(join(tmpdir(), 'preview-runtime-layout-'));
  t.after(() => rmSync(runtimeRoot, { recursive: true, force: true }));
  cpSync(join(packageRoot, 'dist'), join(runtimeRoot, 'dist'), { recursive: true });
  copyFileSync(join(packageRoot, 'package.json'), join(runtimeRoot, 'package.json'));
  const runtime = await import(pathToFileURL(join(runtimeRoot, 'dist/preview-lifecycle.mjs')).href);
  const f = fixture(t);
  const head = commitOn(f, 'runtime-identity-nested-module', { 'app.txt': 'Runtime identity fixture\n' });
  const request = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const nestedPaths = ['owner-addition/owner-addition-validation.mjs', 'ci-execution/ci-execution-result.mjs', 'owner-amendment/owner-amendment-tag-readback.mjs',
    'owner-amendment/owner-amendment-tag-api.mjs', 'owner-amendment/owner-amendment-tag-attempt.mjs',
    'owner-amendment/owner-amendment-semantic-tag-object.mjs',
    'owner-amendment/owner-amendment-artifact.mjs', 'owner-amendment/owner-amendment-artifact-discovery.mjs',
    'owner-amendment/owner-amendment-attestation.mjs', 'owner-amendment/owner-amendment-artifact-zip.mjs',
    'github/github-associated-repository.mjs', 'github/github-cli-runner.mjs',
    'owner-amendment/owner-amendment-handoff-pr-run-context.mjs',
    'owner-amendment/owner-amendment-workflow-run-merge-group-context.mjs', 'owner-amendment/owner-amendment-scope.mjs',
    'github/github-authority-source.mjs', 'github/github-merge-group-event.mjs', 'github/github-owner-amendment-readback.mjs',
    'github/github-owner-addition-readback.mjs', 'github/github-app-check-reporter.mjs',
    'github/github-ruleset-readback.mjs', 'review-inputs/review-input-path.mjs',
    'authority-validation/legacy-git-snapshot.mjs', 'authority-validation/json-schema.mjs',
    'authority-validation/multi-authority-provenance.mjs', 'ci-review/prepared-ci-decision.mjs', 'ci-review/ci-decision-kind.mjs', 'ci-review/verify-legacy-validation-selection.mjs'];
  assert.ok(request.runtime.files['preview-lifecycle.mjs']);
  assert.ok(request.runtime.files['../package.json']);
  for (const nestedPath of nestedPaths) {
    assert.equal(request.runtime.files[nestedPath], createHash('sha256')
      .update(readFileSync(join(runtimeRoot, 'dist', nestedPath))).digest('hex'));
  }
  assert.ok(readdirSync(join(runtimeRoot, 'dist')).filter(file => file.endsWith('.mjs')).every(file => request.runtime.files[file]));
  const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(receipt, f.root);

  const unchangedPaths = [...nestedPaths.map(path => path.split('/').at(-1)),
    'preview-lifecycle.mjs', '../package.json'];
  const unchangedDigests = unchangedPaths.map(file => {
    const path = join(runtimeRoot, 'dist', file);
    return [path, createHash('sha256').update(readFileSync(path)).digest('hex')];
  });
  const packageBefore = request.runtime.files['../package.json'];
  for (const nestedPath of nestedPaths) {
    const path = join(runtimeRoot, 'dist', nestedPath);
    const originalBytes = readFileSync(path);
    try {
      appendFileSync(path, '\n// isolated runtime-byte mutation\n');
      const changedRequest = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
      assert.notEqual(changedRequest.runtime.files[nestedPath], request.runtime.files[nestedPath]);
      assert.equal(changedRequest.runtime.files[nestedPath], createHash('sha256').update(readFileSync(path)).digest('hex'));
      for (const otherPath of nestedPaths.filter(other => other !== nestedPath)) {
        assert.equal(changedRequest.runtime.files[otherPath], request.runtime.files[otherPath]);
      }
      for (const [unchangedPath, digest] of unchangedDigests) {
        assert.equal(createHash('sha256').update(readFileSync(unchangedPath)).digest('hex'), digest);
      }
      await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root), /request differs from immutable predecessor inputs/);
      await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root), /request differs from immutable predecessor inputs/);
    } finally {
      // Each rejection is attributed to one leaf, against the same valid baseline.
      writeFileSync(path, originalBytes);
    }
  }
  // One fresh request/receipt covers the changed bytes of every grouped leaf.
  // Per-leaf stale rejection above remains independent; repeated fresh Git
  // reconstruction for every leaf adds no distinct success-path assertion.
  for (const nestedPath of nestedPaths) appendFileSync(join(runtimeRoot, 'dist', nestedPath), '\n// combined runtime-byte mutation\n');
  const freshRequest = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  for (const nestedPath of nestedPaths) {
    assert.notEqual(freshRequest.runtime.files[nestedPath], request.runtime.files[nestedPath]);
    assert.equal(freshRequest.runtime.files[nestedPath], createHash('sha256').update(readFileSync(join(runtimeRoot, 'dist', nestedPath))).digest('hex'));
  }
  const freshReceipt = await runtime.completePreviewLifecycle(freshRequest, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(freshReceipt, f.root);

  const flatRoot = mkdtempSync(join(tmpdir(), 'preview-runtime-flat-layout-'));
  t.after(() => rmSync(flatRoot, { recursive: true, force: true }));
  cpSync(join(packageRoot, 'dist'), join(flatRoot, 'dist'), { recursive: true });
  copyFileSync(join(packageRoot, 'package.json'), join(flatRoot, 'package.json'));
  writeFileSync(join(flatRoot, 'dist/owner-addition-validation.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-addition/owner-addition-validation.mjs')));
  writeFileSync(join(flatRoot, 'dist/ci-execution-result.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-execution/ci-execution-result.mjs')));
  writeFileSync(join(flatRoot, 'dist/owner-amendment-tag-readback.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-amendment/owner-amendment-tag-readback.mjs')));
  for (const file of ['owner-amendment-tag-api.mjs', 'owner-amendment-tag-attempt.mjs',
    'owner-amendment-semantic-tag-object.mjs', 'owner-amendment-artifact.mjs',
    'owner-amendment-artifact-discovery.mjs', 'owner-amendment-attestation.mjs', 'owner-amendment-artifact-zip.mjs',
    'owner-amendment-handoff-pr-run-context.mjs', 'owner-amendment-workflow-run-merge-group-context.mjs', 'owner-amendment-scope.mjs']) {
    // Restore the former flat dependency paths only in this synthetic legacy copy.
    writeFileSync(join(flatRoot, 'dist', file),
      readFileSync(join(flatRoot, 'dist/owner-amendment', file), 'utf8').replace(/from '\.\.\//g, "from './"));
  }
  for (const file of ['github-associated-repository.mjs', 'github-cli-runner.mjs',
    'github-authority-source.mjs', 'github-merge-group-event.mjs', 'github-owner-amendment-readback.mjs',
    'github-owner-addition-readback.mjs', 'github-app-check-reporter.mjs', 'github-ruleset-readback.mjs']) {
    writeFileSync(join(flatRoot, 'dist', file), readFileSync(join(flatRoot, 'dist/github', file)));
  }
  writeFileSync(join(flatRoot, 'dist/review-input-path.mjs'),
    readFileSync(join(flatRoot, 'dist/review-inputs/review-input-path.mjs')));
  writeFileSync(join(flatRoot, 'dist/legacy-git-snapshot.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/legacy-git-snapshot.mjs')));
  writeFileSync(join(flatRoot, 'dist/json-schema.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/json-schema.mjs')));
  writeFileSync(join(flatRoot, 'dist/multi-authority-provenance.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/multi-authority-provenance.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/prepared-ci-decision.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-review/prepared-ci-decision.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/ci-decision-kind.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-review/ci-decision-kind.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/verify-legacy-validation-selection.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-review/verify-legacy-validation-selection.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  rmSync(join(flatRoot, 'dist/ci-review'), { recursive: true });
  rmSync(join(flatRoot, 'dist/authority-validation'), { recursive: true });
  rmSync(join(flatRoot, 'dist/review-inputs'), { recursive: true });
  rmSync(join(flatRoot, 'dist/github'), { recursive: true });
  rmSync(join(flatRoot, 'dist/owner-amendment'), { recursive: true });
  rmSync(join(flatRoot, 'dist/owner-addition'), { recursive: true });
  rmSync(join(flatRoot, 'dist/ci-execution'), { recursive: true });
  const flatRuntime = await import(pathToFileURL(join(flatRoot, 'dist/preview-lifecycle.mjs')).href);
  const flatRequest = await flatRuntime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const expectedFlatPaths = readdirSync(join(flatRoot, 'dist')).filter(file => file.endsWith('.mjs')).sort();
  assert.equal(flatRequest.runtime.nodeVersion, process.version);
  assert.deepEqual(Object.keys(flatRequest.runtime.files).filter(file => file !== '../package.json').sort(), expectedFlatPaths);
  assert.equal(flatRequest.runtime.files['../package.json'], packageBefore);
  const flatReceipt = await flatRuntime.completePreviewLifecycle(flatRequest, ordinary(decision()), f.root);
  await flatRuntime.validatePreviewReceipt(flatReceipt, f.root);
});
