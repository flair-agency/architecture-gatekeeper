import assert from 'node:assert/strict';
import { appendFileSync, cpSync, copyFileSync, mkdtempSync, readdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import '@flair-agency/architecture-gatekeeper/preview-lifecycle';
import { ordinary, decision, fixture, spec, commitOn } from './fixtures/preview-lifecycle-runtime.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
    'github/github-ruleset-readback.mjs', 'github/github-ruleset-readback-cli.mjs', 'review-inputs/review-input-path.mjs',
    'authority-validation/legacy-git-snapshot.mjs', 'authority-validation/json-schema.mjs',
    'authority-validation/multi-authority-provenance.mjs', 'ci-review/prepared-ci-decision.mjs', 'ci-review/ci-decision-kind.mjs', 'ci-review/verify-legacy-validation-selection.mjs', 'ci-execution/ci-execution-observation.mjs', 'owner-amendment/owner-amendment-block-semantic-record.mjs', 'owner-amendment/owner-amendment-block-context-verifier.mjs', 'owner-amendment/owner-amendment-block-evidence-composer.mjs', 'authority-validation/validate-decision.mjs', 'authority-validation/validate-authority-set-decision.mjs', 'authority-validation/preflight-authority-set-review.mjs', 'review-inputs/prepare-review-file-context.mjs', 'review-inputs/prepare-review-context.mjs', 'review-inputs/materialize-review-workspace.mjs', 'review-inputs/review-security-proxy.mjs', 'review-contract/review-contract.mjs', 'authority-validation/resolve-ci-policy.mjs', 'authority-validation/prepare-authority-set.mjs', 'owner-addition/owner-addition-adoption.mjs', 'owner-addition/owner-decision-addition.mjs'];
  nestedPaths.push('owner-amendment/owner-amendment-block-handoff.mjs',
    'owner-amendment/owner-amendment-block-handoff-compose.mjs',
    'owner-amendment/owner-amendment-block-handoff-orchestrator.mjs',
    'owner-amendment/owner-amendment-owner-decision-handoff.mjs',
    'owner-amendment/owner-amendment-owner-decision-handoff-cli.mjs',
    'owner-amendment/owner-amendment-handoff-cli.mjs',
    'owner-amendment/owner-amendment-owner-decision-record.mjs',
    'owner-amendment/owner-amendment-owner-decision-amendment-record.mjs',
    'owner-amendment/owner-amendment-owner-decision-context-verifier.mjs',
    'owner-amendment/owner-amendment-block-record.mjs',
    'owner-amendment/owner-amendment-record-builder.mjs',
    'owner-amendment/owner-amendment-merge-group-block-bridge.mjs',
    'owner-amendment/owner-amendment-merge-group-b-context.mjs',
    'owner-amendment/owner-amendment-merge-group-evidence.mjs',
    'owner-amendment/owner-amendment-merge-group-ordinary-review.mjs',
    'owner-amendment/owner-amendment-merge-group-acceptance.mjs',
    'owner-amendment/owner-amendment-semantic-eligibility.mjs',
    'owner-amendment/owner-amendment-semantic-producer-attempts.mjs',
    'authority-validation/authority-set.mjs',
    'ci-review/ci-enforced-acceptance.mjs',
    'ci-review/ci-procedural-authority-change.mjs',
    'ci-review/ci-procedural-acceptance.mjs',
    'ci-review/ci-report.mjs',
    'owner-amendment/owner-amendment.mjs',
    'gemini-cli/gemini-cli-response.mjs',
    'gemini-cli/gemini-cli-process.mjs',
    'gemini-cli/gemini-cli-proxy-session.mjs',
    'gemini-cli/gemini-cli-session.mjs',
    'gemini-cli/prepared-gemini-ci-review.mjs',
    'reviewer-transports/codex-transport.mjs',
    'reviewer-transports/local-reviewer-execution.mjs',
    'runner-paths/runner-temp-path.mjs',
    'local-review/local-gate.mjs',
    'local-review/local-post-tool-screen.mjs',
    'local-review/manual-review.mjs',
    'owner-addition/owner-addition-finalize.mjs',
    'owner-addition/multi-authority-eligibility.mjs');
  assert.ok(request.runtime.files['preview-lifecycle.mjs']);
  assert.ok(request.runtime.files['../package.json']);
  for (const nestedPath of nestedPaths) {
    assert.equal(request.runtime.files[nestedPath], createHash('sha256')
      .update(readFileSync(join(runtimeRoot, 'dist', nestedPath))).digest('hex'));
  }
  assert.ok(readdirSync(join(runtimeRoot, 'dist')).filter(file => file.endsWith('.mjs')).every(file => request.runtime.files[file]));
  const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(receipt, f.root);

  const unchangedPaths = [...new Set([...nestedPaths.map(path => path.split('/').at(-1)),
    'preview-lifecycle.mjs'].filter(file => existsSync(join(runtimeRoot, 'dist', file))))];
  unchangedPaths.push('../package.json');
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
  // The legacy CLI was an unconditional flat side effect, not a re-exporting facade.
  // Restore its exact original bytes before removing the grouped directory so the
  // synthetic predecessor exercises the old collection layout without importing it.
  const legacyRulesetCli = [
    "import { writeFileSync, mkdirSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "import { produceRulesetReadback, rulesetStorageDirectory } from './github-ruleset-readback.mjs';",
    '',
    '// Only this step inherits the App key. No JWT or installation token is output,',
    '// written to disk, placed in workflow outputs, or passed to normal handoff code.',
    'try {',
    '  const directory = rulesetStorageDirectory(process.env);',
    "  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw new Error('Ordinary credentials must not enter the isolated process.');",
    '  const result = await produceRulesetReadback({ env: process.env });',
    '  mkdirSync(directory, { mode: 0o700 });',
    "  if (Buffer.byteLength(JSON.stringify(result)) > 65_536) throw new Error('Local readback exceeds bounds.');",
    "  writeFileSync(join(directory, 'snapshot.json'), `${JSON.stringify(result)}\\n`, { mode: 0o600, flag: 'wx' });",
    "  process.stdout.write('Complete local ruleset readback stored after installation-token revocation.\\n');",
    '} catch {',
    "  process.stderr.write('Isolated ruleset readback incomplete; no handoff authorization or credential output.\\n');",
    '  process.exitCode = 1;',
    '}',
    '',
  ].join('\n');
  writeFileSync(join(flatRoot, 'dist/github-ruleset-readback-cli.mjs'), legacyRulesetCli);
  const flatRulesetResult = spawnSync(process.execPath, [join(flatRoot, 'dist/github-ruleset-readback-cli.mjs')], {
    cwd: flatRoot, env: { PATH: process.env.PATH ?? '' }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(flatRulesetResult.error, undefined);
  assert.equal(flatRulesetResult.status, 1);
  assert.equal(flatRulesetResult.stdout, '');
  assert.equal(flatRulesetResult.stderr, 'Isolated ruleset readback incomplete; no handoff authorization or credential output.\n');
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
  writeFileSync(join(flatRoot, 'dist/ci-execution-observation.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-execution/ci-execution-observation.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/owner-amendment-block-semantic-record.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-amendment/owner-amendment-block-semantic-record.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/owner-amendment-block-context-verifier.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-amendment/owner-amendment-block-context-verifier.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/owner-amendment-block-evidence-composer.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-amendment/owner-amendment-block-evidence-composer.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/validate-decision.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/validate-decision.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/validate-authority-set-decision.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/validate-authority-set-decision.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/preflight-authority-set-review.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/preflight-authority-set-review.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/prepare-review-file-context.mjs'),
    readFileSync(join(flatRoot, 'dist/review-inputs/prepare-review-file-context.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/prepare-review-context.mjs'),
    readFileSync(join(flatRoot, 'dist/review-inputs/prepare-review-context.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/materialize-review-workspace.mjs'),
    readFileSync(join(flatRoot, 'dist/review-inputs/materialize-review-workspace.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/review-security-proxy.mjs'),
    readFileSync(join(flatRoot, 'dist/review-inputs/review-security-proxy.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/review-contract.mjs'),
    readFileSync(join(flatRoot, 'dist/review-contract/review-contract.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/resolve-ci-policy.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/resolve-ci-policy.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/prepare-authority-set.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/prepare-authority-set.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/owner-addition-adoption.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-addition/owner-addition-adoption.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/owner-decision-addition.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-addition/owner-decision-addition.mjs'), 'utf8').replace(/from '\.\.\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/owner-addition-finalize-helper.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-addition/owner-addition-finalize.mjs'), 'utf8')
      .replace(/from (["'])\.\.\/authority-validation\//g, "from $1./"));
  const finalizerCliPath = join(flatRoot, 'dist/owner-addition-finalize.mjs');
  writeFileSync(finalizerCliPath, readFileSync(finalizerCliPath, 'utf8')
    .replace(/from (["'])\.\/owner-addition\/owner-addition-finalize\.mjs\1/, "from './owner-addition-finalize-helper.mjs'"));
  writeFileSync(join(flatRoot, 'dist/multi-authority-eligibility-helper.mjs'),
    readFileSync(join(flatRoot, 'dist/owner-addition/multi-authority-eligibility.mjs'), 'utf8')
      .replace(/from (["'])\.\.\//g, "from $1./"));
  const multiAuthorityCliPath = join(flatRoot, 'dist/owner-addition-multiauthority.mjs');
  writeFileSync(multiAuthorityCliPath, readFileSync(multiAuthorityCliPath, 'utf8')
    .replace(/from (["'])\.\/owner-addition\/multi-authority-eligibility\.mjs\1/, "from './multi-authority-eligibility-helper.mjs'"));
  for (const file of ['owner-amendment-block-handoff.mjs',
    'owner-amendment-block-handoff-compose.mjs', 'owner-amendment-block-handoff-orchestrator.mjs',
    'owner-amendment-owner-decision-handoff.mjs', 'owner-amendment-owner-decision-handoff-cli.mjs',
    'owner-amendment-handoff-cli.mjs', 'owner-amendment-owner-decision-record.mjs',
    'owner-amendment-owner-decision-amendment-record.mjs',
    'owner-amendment-owner-decision-context-verifier.mjs', 'owner-amendment-block-record.mjs',
    'owner-amendment-record-builder.mjs', 'owner-amendment-merge-group-block-bridge.mjs',
    'owner-amendment-merge-group-b-context.mjs', 'owner-amendment-merge-group-evidence.mjs',
    'owner-amendment-merge-group-ordinary-review.mjs', 'owner-amendment-merge-group-acceptance.mjs',
    'owner-amendment-semantic-eligibility.mjs', 'owner-amendment-semantic-producer-attempts.mjs',
    'owner-amendment.mjs']) {
    writeFileSync(join(flatRoot, 'dist', file),
      readFileSync(join(flatRoot, 'dist/owner-amendment', file), 'utf8').replace(/from '\.\.\//g, "from './"));
  }
  for (const file of ['gemini-cli-response.mjs', 'gemini-cli-process.mjs', 'gemini-cli-proxy-session.mjs',
    'gemini-cli-session.mjs', 'prepared-gemini-ci-review.mjs']) {
    writeFileSync(join(flatRoot, 'dist', file),
      readFileSync(join(flatRoot, 'dist/gemini-cli', file), 'utf8')
        .replace(/from '\.\.\/review-contract\//g, "from './")
        .replace(/from '\.\.\/review-inputs\//g, "from './")
        .replace(/from '\.\.\/authority-validation\//g, "from './")
        .replace(/from '\.\.\//g, "from './"));
  }
  writeFileSync(join(flatRoot, 'dist/codex-transport.mjs'),
    readFileSync(join(flatRoot, 'dist/reviewer-transports/codex-transport.mjs'), 'utf8'));
  writeFileSync(join(flatRoot, 'dist/local-reviewer-execution.mjs'),
    readFileSync(join(flatRoot, 'dist/reviewer-transports/local-reviewer-execution.mjs'), 'utf8')
      .replace("from '../gemini-transport.mjs'", "from './gemini-transport.mjs'"));
  writeFileSync(join(flatRoot, 'dist/runner-temp-path.mjs'),
    readFileSync(join(flatRoot, 'dist/runner-paths/runner-temp-path.mjs'), 'utf8')
      .replace(/from '\.\.\//g, "from './"));
  for (const file of ['local-gate.mjs', 'local-post-tool-screen.mjs', 'manual-review.mjs']) {
    writeFileSync(join(flatRoot, 'dist', file),
      readFileSync(join(flatRoot, 'dist/local-review', file), 'utf8')
        .replace(/from '\.\.\/review-contract\//g, "from './")
        .replace(/from '\.\.\/reviewer-transports\//g, "from './")
        .replace(/from '\.\.\//g, "from './"));
  }
  rmSync(join(flatRoot, 'dist/local-review'), { recursive: true });
  rmSync(join(flatRoot, 'dist/runner-paths'), { recursive: true });
  rmSync(join(flatRoot, 'dist/reviewer-transports'), { recursive: true });
  rmSync(join(flatRoot, 'dist/gemini-cli'), { recursive: true });
  rmSync(join(flatRoot, 'dist/review-contract'), { recursive: true });
  writeFileSync(join(flatRoot, 'dist/authority-set.mjs'),
    readFileSync(join(flatRoot, 'dist/authority-validation/authority-set.mjs'), 'utf8'));
  for (const file of ['ci-enforced-acceptance.mjs', 'ci-procedural-authority-change.mjs']) {
    writeFileSync(join(flatRoot, 'dist', file),
      readFileSync(join(flatRoot, 'dist/ci-review', file), 'utf8')
        .replace(/from '\.\.\/authority-validation\//g, "from './"));
  }
  writeFileSync(join(flatRoot, 'dist/ci-report-helpers.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-review/ci-report.mjs'), 'utf8')
      .replace(/from '\.\.\/authority-validation\//g, "from './")
      .replace(/from '\.\.\/github\//g, "from './"));
  writeFileSync(join(flatRoot, 'dist/ci-procedural-acceptance-helpers.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-review/ci-procedural-acceptance.mjs'), 'utf8'));
  const proceduralAcceptanceCliPath = join(flatRoot, 'dist/ci-procedural-acceptance.mjs');
  writeFileSync(proceduralAcceptanceCliPath, readFileSync(proceduralAcceptanceCliPath, 'utf8')
    .replace(/from ["']\.\/ci-review\/ci-procedural-acceptance\.mjs["']/, "from './ci-procedural-acceptance-helpers.mjs'"));
  writeFileSync(join(flatRoot, 'dist/codex-pass-publication.mjs'),
    readFileSync(join(flatRoot, 'dist/ci-review/codex-pass-publication.mjs'), 'utf8')
      .replace(/from '\.\.\/authority-set\.mjs'/g, "from './authority-set.mjs'"));
  writeFileSync(join(flatRoot, 'dist/codex-pass-log.mjs'),
    readFileSync(join(flatRoot, 'dist/github/codex-pass-log.mjs'), 'utf8')
      .replace(/from '\.\.\/ci-review\/codex-pass-publication\.mjs'/g, "from './codex-pass-publication.mjs'"));
  const reportCliPath = join(flatRoot, 'dist/ci-report.mjs');
  writeFileSync(reportCliPath, readFileSync(reportCliPath, 'utf8')
    .replace(/from ["']\.\/ci-review\/ci-report\.mjs["']/, "from './ci-report-helpers.mjs'"));
  rmSync(join(flatRoot, 'dist/ci-review'), { recursive: true });
  rmSync(join(flatRoot, 'dist/authority-validation'), { recursive: true });
  rmSync(join(flatRoot, 'dist/review-inputs'), { recursive: true });
  rmSync(join(flatRoot, 'dist/github'), { recursive: true });
  rmSync(join(flatRoot, 'dist/owner-amendment'), { recursive: true });
  rmSync(join(flatRoot, 'dist/owner-addition'), { recursive: true });
  rmSync(join(flatRoot, 'dist/ci-execution'), { recursive: true });
  const flatFinalizer = await import(pathToFileURL(finalizerCliPath).href);
  assert.equal(typeof flatFinalizer.buildOwnerAdditionFinalRecord, 'function');
  const flatMultiAuthority = await import(pathToFileURL(multiAuthorityCliPath).href);
  assert.equal(typeof flatMultiAuthority.validateMultiAuthorityEligibility, 'function');
  assert.equal(typeof flatMultiAuthority.validateMultiAuthorityEligibilitySchema, 'function');
  const flatProceduralAcceptance = await import(pathToFileURL(proceduralAcceptanceCliPath).href);
  assert.deepEqual(Object.keys(flatProceduralAcceptance), ['assertProceduralV5Acceptance']);
  assert.deepEqual(flatProceduralAcceptance.assertProceduralV5Acceptance({ policyVersion: '5', evidenceProducer: 'github-actions',
    reviewResult: 'success', conclusion: 'PASS', selectedAuthorityChanged: 'false' }), { route: 'ordinary-pass' });
  const proceduralCli = spawnSync(process.execPath, [proceduralAcceptanceCliPath], { encoding: 'utf8', env: {
    POLICY_VERSION: '5', EVIDENCE_PRODUCER: 'github-actions', REVIEW_RESULT: 'success',
    CONCLUSION: 'PASS', SELECTED_AUTHORITY_CHANGED: 'false',
  } });
  assert.equal(proceduralCli.status, 0, proceduralCli.stderr);
  assert.equal(proceduralCli.stdout, 'Procedural v5 acceptance route: ordinary-pass\n');
  const flatCodexTransport = await import(pathToFileURL(join(flatRoot, 'dist/codex-transport.mjs')).href);
  const flatLocalReviewer = await import(pathToFileURL(join(flatRoot, 'dist/local-reviewer-execution.mjs')).href);
  assert.equal(typeof flatCodexTransport.runCodexReviewer, 'function');
  assert.equal(typeof flatLocalReviewer.executeLocalReviewerSync, 'function');
  assert.equal(typeof flatLocalReviewer.executeLocalReviewer, 'function');
  const flatRuntime = await import(pathToFileURL(join(flatRoot, 'dist/preview-lifecycle.mjs')).href);
  const flatRequest = await flatRuntime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  const expectedFlatPaths = readdirSync(join(flatRoot, 'dist')).filter(file => file.endsWith('.mjs')).sort();
  assert.equal(flatRequest.runtime.nodeVersion, process.version);
  assert.deepEqual(Object.keys(flatRequest.runtime.files).filter(file => file !== '../package.json').sort(), expectedFlatPaths);
  assert.equal(flatRequest.runtime.files['../package.json'], packageBefore);
  assert.equal(flatRequest.runtime.files['github-ruleset-readback-cli.mjs'], createHash('sha256').update(legacyRulesetCli).digest('hex'));
  const flatReceipt = await flatRuntime.completePreviewLifecycle(flatRequest, ordinary(decision()), f.root);
  await flatRuntime.validatePreviewReceipt(flatReceipt, f.root);
});


test('ruleset CLI source and emitted entrypoint fail closed before external access without RUNNER_TEMP', () => {
  const safeEnv = { PATH: process.env.PATH ?? '' };
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('GITHUB_') || name.startsWith('OWNER_AMENDMENT_') || name.startsWith('RULESET_READBACK_') || name === 'GH_TOKEN' || name === 'RUNNER_TEMP') {
      delete safeEnv[name];
    }
  }
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@flair-agency/architecture-gatekeeper/preview-lifecycle'))));
  const entrypoints = [
    ...(existsSync(join(repositoryRoot, 'src/github-ruleset-readback-cli.mjs'))
      ? [join(repositoryRoot, 'src/github-ruleset-readback-cli.mjs')]
      : []),
    join(packageRoot, 'dist/github-ruleset-readback-cli.mjs'),
  ];
  for (const entrypoint of entrypoints) {
    const result = spawnSync(process.execPath, [entrypoint], {
      cwd: repositoryRoot,
      env: safeEnv,
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.error, undefined, `${entrypoint} must exit without spawn errors`);
    assert.equal(result.status, 1, `${entrypoint} must reject a missing RUNNER_TEMP`);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Isolated ruleset readback incomplete; no handoff authorization or credential output.\n');
  }
});
