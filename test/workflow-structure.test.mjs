import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWorkflow, assertWorkflowStructure } from './helpers/workflow-structure.mjs';
import { stringify } from 'yaml';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = {
  consumer: read('../.github/workflows/architecture-gate-consumer.yml'),
  self: read('../.github/workflows/architecture-gate.yml'),
  caller: read('../.github/workflows/self-architecture-gate.yml'),
  providers: read('../.github/workflows/architecture-gate-providers.yml'),
};
const workflows = () => Object.fromEntries(Object.entries(source).map(([key, text]) => [key, parseWorkflow(text, key)]));
const valid = () => assertWorkflowStructure(workflows());

test('production workflow files satisfy parsed structural invariants', valid);

test('review jobs recover stale merge metadata once and validate exact ordered event parents', () => {
  const mergeSha = '${{ github.event.pull_request.merge_commit_sha }}';
  const workflowsToCheck = workflows();
  const checkedScripts = [];
  const runInline = (script, env, cwd) => spawnSync('/bin/bash', ['-e', '-u', '-o', 'pipefail', '-c', script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

  for (const profile of ['consumer', 'self', 'providers']) {
    const jobName = 'review';
    const steps = workflowsToCheck[profile].jobs[jobName].steps;
    const guardIndex = steps.findIndex(step => step.name === 'Validate immutable pull request merge revision');
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@') && step.with?.ref === mergeSha);
    const metadataIndex = steps.findIndex(step => step.name === 'Check event merge revision metadata');
    const resolveIndex = steps.findIndex(step => step.name === 'Resolve current pull request merge ref once');
    const refreshIndex = steps.findIndex(step => step.name === 'Refresh current pull request merge revision');
    const recordIndex = steps.findIndex(step => step.name === 'Record reviewed merge revision');
    const buildIndex = steps.findIndex(step => step.name === 'Build the pinned validation runtime' || step.name === 'Build the pinned protected runtime');
    assert.ok(guardIndex > steps.findIndex(step => step.name === 'Check enforced credentials'), `${profile} guard follows credential check`);
    assert.ok(checkoutIndex > guardIndex, `${profile} immutable checkout follows event tuple guard`);
    assert.ok(metadataIndex > checkoutIndex, `${profile} metadata comparison follows initial checkout`);
    assert.ok(resolveIndex > metadataIndex && refreshIndex > resolveIndex && refreshIndex < recordIndex, `${profile} bounded immutable refresh precedes final revision record`);
    assert.ok(buildIndex > recordIndex, `${profile} exact merge tuple check precedes runtime build`);

    const guard = steps[guardIndex];
    assert.deepEqual(guard.env, {
      MERGE_SHA: mergeSha,
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    assert.match(guard.run, /process\.env\.MERGE_SHA/);
    assert.match(guard.run, /process\.env\.BASE_SHA/);
    assert.match(guard.run, /process\.env\.HEAD_SHA/);
    assert.equal(steps[checkoutIndex].with['fetch-depth'], 0);
    assert.equal(steps[checkoutIndex].with.submodules, "${{ needs.policy.outputs.authority_manifest_path == '' && 'recursive' || 'false' }}");
    assert.equal(steps[checkoutIndex].with.token, "${{ needs.policy.outputs.authority_manifest_path == '' && secrets.CI_SOURCE_READ_TOKEN || github.token }}");
    assert.equal(steps[checkoutIndex].with['persist-credentials'], false);
    assert.ok(!steps[checkoutIndex].with.ref.includes('refs/pull/'), `${profile} initial checkout uses the immutable event SHA`);

    const resolver = steps[resolveIndex];
    assert.equal(resolver.id, 'refresh_merge');
    assert.equal(resolver.if, "steps.event_revision.outputs.refresh == 'true'");
    assert.equal(resolver['timeout-minutes'], 1, `${profile} merge-ref lookup has a bounded step timeout`);
    assert.deepEqual(resolver.env, {
      FETCH_TOKEN: steps[checkoutIndex].with.token,
      REPOSITORY: '${{ github.repository }}',
      SERVER_URL: '${{ github.server_url }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
    });
    assert.match(resolver.run, /timeout 30s git ls-remote --refs/);
    assert.match(resolver.run, /GIT_CONFIG_KEY_0=.*http\..*extraheader/);
    assert.match(resolver.run, /echo \"::add-mask::\$AUTH\"/);
    assert.match(resolver.run, /REFRESHED_SHA.*\^\[a-f0-9\]\{40\}\$/);
    assert.match(resolver.run, /REFRESHED_REF.*MERGE_REF/);
    const refresh = steps[refreshIndex];
    assert.equal(refresh.if, "steps.event_revision.outputs.refresh == 'true'");
    assert.equal(refresh.with.ref, '${{ steps.refresh_merge.outputs.sha }}');
    assert.equal(refresh.with['fetch-depth'], 0, `${profile} refresh fetches only the merge commit and its parents`);
    assert.equal(refresh['timeout-minutes'], 3, `${profile} refresh has a bounded checkout timeout`);
    assert.equal(refresh.with.submodules, steps[checkoutIndex].with.submodules, `${profile} refreshed checkout rematerializes selected submodules`);
    assert.equal(refresh.with.token, steps[checkoutIndex].with.token, `${profile} refresh uses the same read-only checkout token selection`);
    assert.equal(refresh.with['persist-credentials'], false);

    const metadata = steps[metadataIndex];
    checkedScripts.push({ profile, metadata: metadata.run, resolver: resolver.run, record: steps[recordIndex].run });
    assert.equal(metadata.id, 'event_revision');
    assert.deepEqual(metadata.env, {
      EXPECTED_MERGE_SHA: mergeSha,
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    assert.match(metadata.run, /actual_sha.*EXPECTED_MERGE_SHA/);
    assert.match(metadata.run, /Initial checkout SHA.*differs from event merge SHA/);
    assert.match(metadata.run, /actual_parents.*expected_parents/);
    assert.match(metadata.run, /printf .*expected.*got/);
    assert.match(metadata.run, /refresh=false/);
    assert.match(metadata.run, /refresh=true/);

    const record = steps[recordIndex];
    assert.equal(record.id, 'revision');
    assert.deepEqual(record.env, {
      EXPECTED_MERGE_SHA: mergeSha,
      REFRESHED: '${{ steps.event_revision.outputs.refresh }}',
      REFRESHED_SHA: '${{ steps.refresh_merge.outputs.sha }}',
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    assert.match(record.run, /git rev-parse HEAD/);
    assert.match(record.run, /git --no-replace-objects rev-list --parents -n 1/);
    assert.match(record.run, /actual_parents.*!=.*expected_parents/);
    assert.match(record.run, /REFRESHED.*true/);
    assert.match(record.run, /printf 'sha=%s\\n' "\$actual_sha"/);
    const context = steps.find(step => step.name === 'Attach exact pull request task context to protected review');
    if (context) assert.equal(context.env.REVIEWED_SHA, '${{ steps.revision.outputs.sha }}');

    const validSha = 'a'.repeat(40);
    const validEvent = { MERGE_SHA: validSha, BASE_SHA: 'b'.repeat(40), HEAD_SHA: 'c'.repeat(40) };
    assert.equal(runInline(guard.run, validEvent).status, 0, `${profile} accepts valid event SHAs`);
    for (const [label, field, value] of [
      ['missing merge', 'MERGE_SHA', undefined], ['malformed base', 'BASE_SHA', 'b'.repeat(39)],
      ['invalid head character', 'HEAD_SHA', 'c'.repeat(39) + 'g'],
    ]) {
      const env = { ...validEvent, [field]: value };
      if (value === undefined) delete env[field];
      assert.notEqual(runInline(guard.run, env).status, 0, `${profile} rejects ${label}`);
    }
  }

  assert.equal(checkedScripts[1].metadata, checkedScripts[0].metadata, 'self and consumer metadata guards stay aligned');
  assert.equal(checkedScripts[2].metadata, checkedScripts[0].metadata, 'provider and consumer metadata guards stay aligned');
  assert.equal(checkedScripts[1].resolver, checkedScripts[0].resolver, 'self and consumer resolver stay aligned');
  assert.equal(checkedScripts[2].resolver, checkedScripts[0].resolver, 'provider and consumer resolver stay aligned');
  assert.equal(checkedScripts[1].record, checkedScripts[0].record, 'self and consumer final validation stay aligned');
  assert.equal(checkedScripts[2].record, checkedScripts[0].record, 'provider and consumer final validation stay aligned');
  const resolverScript = workflowsToCheck.consumer.jobs.review.steps.find(step => step.name === 'Resolve current pull request merge ref once').run;
  const resolverRoot = mkdtempSync(join(tmpdir(), 'agk-merge-ref-resolution-'));
  try {
    const fakeBin = join(resolverRoot, 'bin');
    mkdirSync(fakeBin);
    const fakeGit = join(fakeBin, 'git');
    writeFileSync(fakeGit, `#!/bin/sh\nprintf '%s\n' "$*" >> "$FAKE_GIT_LOG"\nif test "$FAKE_GIT_EXIT" != 0; then exit "$FAKE_GIT_EXIT"; fi\nprintf '%s\n' "$FAKE_GIT_RESPONSE"\n`);
    chmodSync(fakeGit, 0o755);
    const fakeTimeout = join(fakeBin, 'timeout');
    writeFileSync(fakeTimeout, `#!/bin/sh\ntest "$1" = 30s || exit 99\nshift\nexec "$@"\n`);
    chmodSync(fakeTimeout, 0o755);
    const runResolver = response => {
      const output = join(resolverRoot, 'github-output');
      const log = join(resolverRoot, 'git-args');
      writeFileSync(output, '');
      writeFileSync(log, '');
      const result = runInline(resolverScript, {
        FETCH_TOKEN: 'test-token', REPOSITORY: 'owner/repo', SERVER_URL: 'https://github.com',
        PR_NUMBER: '42', GITHUB_OUTPUT: output, FAKE_GIT_RESPONSE: response,
        FAKE_GIT_EXIT: response === 'network-failure' ? '7' : '0', FAKE_GIT_LOG: log,
        PATH: `${fakeBin}:${process.env.PATH || '/usr/bin:/bin'}`,
      });
      return { result, output: readFileSync(output, 'utf8'), args: readFileSync(log, 'utf8') };
    };
    const resolvedSha = 'd'.repeat(40);
    const validResolution = runResolver(`${resolvedSha}\trefs/pull/42/merge`);
    assert.equal(validResolution.result.status, 0, validResolution.result.stderr);
    assert.equal(validResolution.output, `sha=${resolvedSha}\n`);
    assert.equal(validResolution.args.trim().split('\n').length, 1, 'valid merge ref is queried exactly once');
    assert.doesNotMatch(validResolution.args, /test-token|AUTHORIZATION/, 'token is not passed on the git command line');
    for (const [label, response] of [
      ['missing ref', ''],
      ['ambiguous ref', `${resolvedSha}\trefs/pull/42/merge\n${resolvedSha}\trefs/pull/43/merge`],
      ['malformed SHA', `not-a-sha\trefs/pull/42/merge`],
      ['wrong ref name', `${resolvedSha}\trefs/pull/41/merge`],
      ['extra ref data', `${resolvedSha}\trefs/pull/42/merge extra`],
      ['network failure', 'network-failure'],
    ]) {
      const rejected = runResolver(response);
      assert.notEqual(rejected.result.status, 0, `${label} fails immutable ref resolution`);
      assert.equal(rejected.output, '', `${label} emits no candidate SHA`);
      assert.equal(rejected.args.trim().split('\n').length, 1, `${label} performs only one merge-ref query`);
    }
  } finally {
    rmSync(resolverRoot, { recursive: true, force: true });
  }

  const root = mkdtempSync(join(tmpdir(), 'agk-merge-revision-'));
  try {
    const repository = join(root, 'repo');
    mkdirSync(repository);
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
      assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
      return result.stdout.trim();
    };
    git('init', '-q', '-b', 'base');
    git('config', 'user.name', 'Workflow Structure Test');
    git('config', 'user.email', 'workflow-structure@example.invalid');
    writeFileSync(join(repository, 'base.txt'), 'protected base snapshot\n');
    git('add', 'base.txt');
    git('commit', '-q', '-m', 'protected base snapshot');
    const base = git('rev-parse', 'HEAD');
    git('checkout', '-q', '-b', 'candidate');
    writeFileSync(join(repository, 'head.txt'), 'previous candidate head\n');
    git('add', 'head.txt');
    git('commit', '-q', '-m', 'previous candidate head');
    const previousHead = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'base');
    git('merge', '--no-ff', '--no-edit', 'candidate');
    const staleMerge = git('rev-parse', 'HEAD');

    writeFileSync(join(repository, 'head.txt'), 'current candidate head\n');
    git('checkout', '-q', 'candidate');
    git('add', 'head.txt');
    git('commit', '-q', '-m', 'current candidate head');
    const currentHead = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'base');
    git('reset', '--hard', base);
    git('merge', '--no-ff', '--no-edit', 'candidate');
    const freshMerge = git('rev-parse', 'HEAD');
    assert.notEqual(staleMerge, freshMerge, 'fixture represents stale event merge metadata');

    const workflow = workflowsToCheck.consumer.jobs.review.steps;
    const metadata = workflow.find(step => step.name === 'Check event merge revision metadata');
    const record = workflow.find(step => step.name === 'Record reviewed merge revision');
    const outputPath = join(root, 'github-output');

    // A checkout SHA mismatch is not event metadata skew and must never trigger recovery.
    git('checkout', '--detach', staleMerge);
    writeFileSync(outputPath, '');
    const changedCheckout = runInline(metadata.run, {
      EXPECTED_MERGE_SHA: freshMerge, BASE_SHA: base, HEAD_SHA: previousHead, GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.notEqual(changedCheckout.status, 0, 'a changed initial checkout SHA fails without recovery');
    assert.equal(readFileSync(outputPath, 'utf8'), '', 'a changed initial checkout SHA emits no refresh request');

    // The normal exact event tuple remains on the fast path and emits the event SHA.
    git('checkout', '--detach', staleMerge);
    writeFileSync(outputPath, '');
    const normalMetadata = runInline(metadata.run, {
      EXPECTED_MERGE_SHA: staleMerge, BASE_SHA: base, HEAD_SHA: previousHead, GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.equal(normalMetadata.status, 0, normalMetadata.stderr);
    assert.equal(readFileSync(outputPath, 'utf8'), 'refresh=false\n');
    writeFileSync(outputPath, '');
    const normalRecord = runInline(record.run, {
      EXPECTED_MERGE_SHA: staleMerge, REFRESHED: 'false', REFRESHED_SHA: '', BASE_SHA: base,
      HEAD_SHA: previousHead, GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.equal(normalRecord.status, 0, normalRecord.stderr);
    assert.equal(readFileSync(outputPath, 'utf8'), `sha=${staleMerge}\n`);

    // Issue #567: immutable event SHA exists but carries the previous head. One refresh selects the new exact-parent merge.
    git('checkout', '--detach', staleMerge);
    writeFileSync(outputPath, '');
    const staleMetadata = runInline(metadata.run, {
      EXPECTED_MERGE_SHA: staleMerge, BASE_SHA: base, HEAD_SHA: currentHead, GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.equal(staleMetadata.status, 0, staleMetadata.stderr);
    assert.match(staleMetadata.stderr, /stale or invalid parents/);
    assert.equal(readFileSync(outputPath, 'utf8'), 'refresh=true\n');
    git('checkout', '--detach', freshMerge); // models checkout of the single resolved immutable merge SHA
    writeFileSync(outputPath, '');
    const recovered = runInline(record.run, {
      EXPECTED_MERGE_SHA: staleMerge, REFRESHED: 'true', REFRESHED_SHA: freshMerge,
      BASE_SHA: base, HEAD_SHA: currentHead, GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(readFileSync(outputPath, 'utf8'), `sha=${freshMerge}\n`);

    const tree = git('rev-parse', `${freshMerge}^{tree}`);
    const reversed = git('commit-tree', tree, '-p', currentHead, '-p', base);
    const wrongBase = git('commit-tree', tree, '-p', staleMerge, '-p', currentHead);
    const wrongHead = git('commit-tree', tree, '-p', base, '-p', previousHead);
    const oneParent = git('commit-tree', tree, '-p', base);
    const extraParent = git('commit-tree', tree, '-p', base, '-p', currentHead, '-p', previousHead);
    for (const [label, candidate] of [
      ['reversed parents', reversed], ['different base', wrongBase], ['different head', wrongHead],
      ['non-merge candidate', oneParent], ['extra parent', extraParent],
    ]) {
      git('checkout', '--detach', candidate);
      writeFileSync(outputPath, '');
      const rejected = runInline(record.run, {
        EXPECTED_MERGE_SHA: staleMerge, REFRESHED: 'true', REFRESHED_SHA: candidate,
        BASE_SHA: base, HEAD_SHA: currentHead, GITHUB_OUTPUT: outputPath,
      }, repository);
      assert.notEqual(rejected.status, 0, `${label} fails closed after refresh`);
      assert.equal(readFileSync(outputPath, 'utf8'), '', `${label} emits no reviewed SHA`);
    }

    // A refresh that is skipped or remains stale cannot silently accept the old SHA.
    git('checkout', '--detach', staleMerge);
    writeFileSync(outputPath, '');
    const persistent = runInline(record.run, {
      EXPECTED_MERGE_SHA: staleMerge, REFRESHED: 'true', REFRESHED_SHA: freshMerge,
      BASE_SHA: base, HEAD_SHA: currentHead, GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.notEqual(persistent.status, 0, 'persistent stale merge mismatch fails closed');
    assert.equal(readFileSync(outputPath, 'utf8'), '', 'persistent mismatch emits no reviewed SHA');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('protected runtime checkouts build their pinned distribution before use', () => {
  for (const [profile, workflow] of Object.entries(workflows())) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const steps = job.steps ?? [];
      for (let index = 0; index < steps.length; index += 1) {
        const checkout = steps[index];
        const runtimePath = checkout.with?.path;
        if (!['.architecture-gatekeeper-runtime', '.architecture-gatekeeper-validation-runtime'].includes(runtimePath)) continue;

        assert.equal(checkout.with.repository, '${{ job.workflow_repository }}', `${profile}.${jobName} runtime repository`);
        assert.equal(checkout.with.ref, '${{ job.workflow_sha }}', `${profile}.${jobName} runtime revision`);
        assert.equal(checkout.with['persist-credentials'], false, `${profile}.${jobName} runtime checkout credentials`);

        const isolated = ['policy', 'review', 'gemini-review'].includes(jobName);
        const node = steps[index + 1];
        const relocation = isolated ? steps[index + 2] : undefined;
        const nodeStep = node;
        const build = isolated ? steps[index + 3] : steps[index + 2];
        if (isolated) {
          assert.equal(relocation.name, runtimePath.endsWith('validation-runtime')
            ? 'Relocate pinned validation runtime'
            : 'Relocate pinned protected runtime');
          assert.equal(relocation.id, runtimePath.endsWith('validation-runtime') ? 'validation_runtime_location' : 'runtime_location');
          assert.equal(relocation.env.EXPECTED_RUNTIME_SHA, '${{ job.workflow_sha }}');
          assert.match(relocation.run, new RegExp(`node ${runtimePath.replaceAll('.', '\\.')}/scripts/relocate-protected-runtime\\.mjs ${runtimePath.replaceAll('.', '\\.')}`));
          assert.match(relocation.run, />> "\$GITHUB_OUTPUT"$/);
          assert.equal(relocation.if, checkout.if, `${profile}.${jobName} keeps exact conditional runtime selection`);
        }
        assert.equal(nodeStep.uses, 'actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f', `${profile}.${jobName} Node pin`);
        assert.equal(nodeStep.with['node-version'], 22, `${profile}.${jobName} Node version`);
        assert.match(build.name, /^Build the pinned (protected|validation) runtime$/);
        if (isolated) {
          assert.match(build.run, /cd "\$GATEKEEPER_RUNTIME_ROOT"/);
          assert.ok(build.run.indexOf('test -n') < build.run.indexOf('cd '), 'empty output is rejected before changing cwd');
          assert.equal(build.env.GATEKEEPER_RUNTIME_ROOT, runtimePath.endsWith('validation-runtime')
            ? '${{ steps.validation_runtime_location.outputs.root }}'
            : '${{ steps.runtime_location.outputs.root }}');
          assert.match(build.run, /npm ci --ignore-scripts\s+npm run build/);
          assert.doesNotMatch(build.run, /--prefix/);
        } else {
          assert.match(build.run, new RegExp(`npm ci --ignore-scripts --prefix ${runtimePath.replaceAll('.', '\\.')}`));
          assert.match(build.run, new RegExp(`npm run --prefix ${runtimePath.replaceAll('.', '\\.') } build`));
        }
        if (checkout.if !== undefined) assert.equal(build.if, checkout.if, `${profile}.${jobName} conditional runtime selection`);

        const laterRuntimeCalls = steps.slice(isolated ? index + 4 : index + 3).map(step => `${step.run ?? ''}\n${step.env ? JSON.stringify(step.env) : ''}`).join('\n');
        if (isolated) {
          for (const step of steps.slice(isolated ? index + 4 : index + 3)) {
            if ((step.run ?? '').includes('$GATEKEEPER_RUNTIME_ROOT')) assert.equal(typeof step.env?.GATEKEEPER_RUNTIME_ROOT, 'string', `${profile}.${jobName} explicitly binds runtime root in ${step.name}`);
          }
          assert.doesNotMatch(laterRuntimeCalls, new RegExp(`${runtimePath.replaceAll('.', '\\.')}/(?:src|dist|scripts)/`));
          assert.match(laterRuntimeCalls, /\$GATEKEEPER_RUNTIME_ROOT\/(?:dist|scripts)\//);
        } else {
          assert.doesNotMatch(laterRuntimeCalls, new RegExp(`${runtimePath.replaceAll('.', '\\.')}/src/`));
        }
      }
    }
  }
});

test('protected-main handoffs build before secret-bearing steps and execute dist', () => {
  for (const file of [
    '../.github/workflows/owner-amendment-block-handoff.yml',
    '../.github/workflows/owner-amendment-owner-decision-handoff.yml',
  ]) {
    const workflow = parseWorkflow(read(file), file);
    const steps = workflow.jobs.handoff.steps;
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ github.sha }}');
    assert.equal(checkout.with['persist-credentials'], false);
    const setupIndex = steps.findIndex(step => step.uses === 'actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f');
    const buildIndex = steps.findIndex(step => step.name === 'Build the protected runtime');
    const secretIndex = steps.findIndex(step => Object.values(step.env ?? {}).some(value => String(value).includes('secrets.')));
    assert.ok(setupIndex > 0 && buildIndex > setupIndex && secretIndex > buildIndex);
    assert.equal(steps[setupIndex].with['node-version'], 22);
    assert.match(steps[buildIndex].run, /npm ci --ignore-scripts/);
    assert.match(steps[buildIndex].run, /npm run build/);
    assert.doesNotMatch(steps[buildIndex].run, /secrets\./);
    const runtimeCalls = steps.map(step => step.run ?? '').join('\n');
    assert.match(runtimeCalls, /node dist\/github-ruleset-readback-cli\.mjs/);
    assert.match(runtimeCalls, /node dist\/owner-amendment-(?:handoff|owner-decision-handoff)-cli\.mjs/);
    assert.doesNotMatch(runtimeCalls, /node src\//);
  }
});

test('selected protected-base script callers build only when that exact revision declares build', () => {
  const workflow = workflows().self;
  const cases = [
    ['owner-amendment-owner-decision-record', 'owner-amendment-owner-decision-producer.mjs'],
    ['owner-amendment-attempt-classifier', 'owner-amendment-attempt-classifier.mjs'],
    ['owner-amendment-semantic-eligibility', 'owner-amendment-semantic-eligibility-producer.mjs'],
    ['owner-amendment-semantic-eligibility-signer', 'owner-amendment-semantic-eligibility-producer.mjs'],
  ];
  for (const [jobName, scriptName] of cases) {
    const steps = workflow.jobs[jobName].steps;
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'));
    const checkout = steps[checkoutIndex];
    assert.equal(checkout.with.ref, '${{ github.event.pull_request.base.sha }}', `${jobName} must keep exact base selection`);
    assert.equal(checkout.with['persist-credentials'], false, `${jobName} checkout credentials`);
    assert.equal(checkout.with.path, undefined, `${jobName} protected base remains the script root`);
    const setup = steps[checkoutIndex + 1];
    const buildIndex = steps.findIndex(step => step.name === 'Build the exact selected base runtime when supported');
    const build = steps[buildIndex];
    assert.equal(setup.uses, 'actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f', `${jobName} Node pin`);
    assert.equal(setup.with['node-version'], 22, `${jobName} Node version`);
    assert.ok(buildIndex > checkoutIndex, `${jobName} build follows exact base checkout`);
    assert.match(build.run, /JSON\.parse\(fs\.readFileSync\("package\.json"/);
    assert.match(build.run, /npm ci --ignore-scripts/);
    assert.match(build.run, /npm run build/);
    assert.match(build.run, /else[\s\S]*Selected base revision predates the runtime build contract/);
    assert.doesNotMatch(build.run, /\|\| true|git checkout|git reset/);
    assert.equal(build.env, undefined, `${jobName} build receives no step credentials`);

    const scriptCallIndexes = steps.flatMap((step, index) => (step.run ?? '').includes(`/scripts/${scriptName}`) ? [index] : []);
    assert.ok(scriptCallIndexes.length > 0, `${jobName} invokes ${scriptName}`);
    assert.ok(scriptCallIndexes.every(index => index > buildIndex), `${jobName} script runs only after selected-base materialization`);
    const protectedCredentialIndexes = steps.flatMap((step, index) => {
      const names = Object.keys(step.env ?? {}).join(' ');
      return JSON.stringify(step).includes('secrets.') || /(?:GH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|PRIVATE_KEY|ACCESS_TOKEN)/.test(names) ? [index] : [];
    });
    assert.ok(protectedCredentialIndexes.every(index => index > buildIndex), `${jobName} credentials stay after the base build`);
  }

  const buildStep = workflow.jobs['owner-amendment-owner-decision-record'].steps.find(step => step.name === 'Build the exact selected base runtime when supported');
  const runBuildStep = (directory, failBuild = false) => {
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    const logPath = join(directory, 'npm.log');
    const npmPath = join(bin, 'npm');
    writeFileSync(npmPath, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NPM_LOG"\nif test "${FAIL_BUILD:-false}" = true && test "$1" = run; then exit 31; fi\n');
    chmodSync(npmPath, 0o755);
    const result = spawnSync('/bin/bash', ['-e', '-u', '-o', 'pipefail', '-c', buildStep.run], {
      cwd: directory,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NPM_LOG: logPath, FAIL_BUILD: String(failBuild) },
      encoding: 'utf8',
    });
    return { ...result, log: existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean) : [] };
  };
  const root = mkdtempSync(join(tmpdir(), 'agk-base-build-'));
  try {
    const legacy = join(root, 'legacy');
    mkdirSync(legacy);
    writeFileSync(join(legacy, 'package.json'), JSON.stringify({ name: 'legacy-runtime' }));
    const legacyResult = runBuildStep(legacy);
    assert.equal(legacyResult.status, 0, 'valid selected revision without scripts.build continues on its source layout');
    assert.deepEqual(legacyResult.log, [], 'legacy revision does not install dependencies or select another revision');

    const current = join(root, 'current');
    mkdirSync(current);
    writeFileSync(join(current, 'package.json'), JSON.stringify({ name: 'current-runtime', scripts: { build: 'node build.mjs' } }));
    const currentResult = runBuildStep(current);
    assert.equal(currentResult.status, 0);
    assert.deepEqual(currentResult.log, ['ci --ignore-scripts', 'run build']);
    const failingCurrent = join(root, 'current-failure');
    mkdirSync(failingCurrent);
    writeFileSync(join(failingCurrent, 'package.json'), JSON.stringify({ name: 'current-runtime', scripts: { build: 'node build.mjs' } }));
    const failedBuild = runBuildStep(failingCurrent, true);
    assert.equal(failedBuild.status, 31, 'declared build failure stops before source-script invocation');
    assert.deepEqual(failedBuild.log, ['ci --ignore-scripts', 'run build']);

    const invalid = join(root, 'invalid');
    mkdirSync(invalid);
    writeFileSync(join(invalid, 'package.json'), '{ invalid');
    const invalidResult = runBuildStep(invalid);
    assert.notEqual(invalidResult.status, 0, 'invalid package JSON fails closed');
    assert.deepEqual(invalidResult.log, [], 'invalid package JSON never falls back to source execution');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a comment containing required-looking text cannot satisfy a missing structural guard', () => {
  const data = workflows();
  data.consumer.jobs.policy.steps = data.consumer.jobs.policy.steps.filter(step => step.name !== 'Reject unwired reviewer providers');
  assert.throws(() => assertWorkflowStructure(data), /missing parsed step Reject unwired reviewer providers/);
  const commented = `# Reject unwired reviewer providers: SELECTED_PROVIDER, exit 1, needs: [policy]\n${stringify(data.consumer)}`;
  assert.throws(() => {
    const changed = { ...data, consumer: parseWorkflow(commented, 'comment fixture') };
    assertWorkflowStructure(changed);
  }, /missing parsed step Reject unwired reviewer providers/);
});

test('a permission placed on the wrong job fails the target-job permission invariant', () => {
  const data = workflows();
  data.consumer.jobs.report.permissions['id-token'] = 'write';
  assert.throws(() => assertWorkflowStructure(data), /consumer job report must not receive OIDC permission/);
  data.consumer.jobs.report.permissions['id-token'] = 'none';
  data.consumer.jobs.review.permissions['id-token'] = 'write';
  assert.throws(() => assertWorkflowStructure(data), /consumer review permissions/);
});

test('a dropped needs edge fails the dependent job invariant', () => {
  const data = workflows();
  data.consumer.jobs['owner-addition'].needs = ['policy'];
  assert.throws(() => assertWorkflowStructure(data), /consumer owner-addition must depend on policy and review/);

  const misplacedSelfDependency = workflows();
  misplacedSelfDependency.consumer.jobs.review.needs.push('owner-amendment-semantic-eligibility-signer');
  assert.throws(() => assertWorkflowStructure(misplacedSelfDependency), /consumer job review must not depend on self-only owner-amendment-semantic-eligibility-signer/);
});

test('disconnected legacy assurance steps and broadened route conditions fail their selected invariants', () => {
  const disabledLegacy = workflows();
  disabledLegacy.consumer.jobs.review.steps.find(step => step.name === 'Materialize recorded-base legacy authority before review').if = false;
  assert.throws(() => assertWorkflowStructure(disabledLegacy), /needs\.policy\.outputs\.policy_version/);

  const broadenedRoute = workflows();
  const evidence = broadenedRoute.consumer.jobs['owner-addition'].steps.find(step => step.name === 'Preserve exact v5 pre-merge eligibility evidence');
  evidence.if = evidence.if.replace(' && ', ' || ');
  assert.throws(() => assertWorkflowStructure(broadenedRoute), /Preserve exact v5 pre-merge eligibility evidence/);
});

test('a disconnected provider guard fails even when its step remains elsewhere', () => {
  const data = workflows();
  const [guard] = data.consumer.jobs.policy.steps.splice(data.consumer.jobs.policy.steps.findIndex(step => step.name === 'Reject unwired reviewer providers'), 1);
  data.consumer.jobs.review.steps.push(guard);
  assert.throws(() => assertWorkflowStructure(data), /missing parsed step Reject unwired reviewer providers/);
});

test('a disabled provider guard and inherited workflow-level signer permissions fail closed', () => {
  for (const disabledValue of [false, 'false']) {
    const guardDisabled = workflows();
    guardDisabled.consumer.jobs.policy.steps.find(candidate => candidate.name === 'Reject unwired reviewer providers').if = disabledValue;
    assert.throws(() => assertWorkflowStructure(guardDisabled), /consumer provider guard must always run/);

    const selfGuardDisabled = workflows();
    selfGuardDisabled.self.jobs.policy.steps.find(candidate => candidate.name === 'Reject unwired reviewer providers').if = disabledValue;
    assert.throws(() => assertWorkflowStructure(selfGuardDisabled), /self provider guard must always run/);

    const amendmentGuardDisabled = workflows();
    amendmentGuardDisabled.consumer.jobs.policy.steps.find(candidate => candidate.name === 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow').if = disabledValue;
    assert.throws(() => assertWorkflowStructure(amendmentGuardDisabled), /consumer OWNER_AMENDMENT guard must always run/);
  }

  const broadPermissions = workflows();
  broadPermissions.consumer.permissions = { contents: 'read', 'id-token': 'write', attestations: 'write' };
  assert.throws(() => assertWorkflowStructure(broadPermissions), /consumer workflow-level permissions must not grant signer capabilities/);

  for (const scope of ['workflow', 'job']) {
    const selfFlex = workflows();
    if (scope === 'workflow') selfFlex.consumer.env = { ARCHITECTURE_GATE_SELF_FLEX: 'true' };
    else selfFlex.consumer.jobs.policy.env = { service_tier: 'flex' };
    assert.throws(() => assertWorkflowStructure(selfFlex), /consumer workflow must not contain self-only setting/);
  }
});

test('provider and consumer amendment guards retain the selected condition, not just failure keywords', () => {
  const providerMutations = [
    ['removed condition', `echo 'Selected reviewer provider is not wired into this workflow; review is incomplete.' >&2\nexit 1`],
    ['inverted condition', `if test -n "$SELECTED_PROVIDER" && test "$SELECTED_PROVIDER" = codex; then\n  echo 'Selected reviewer provider is not wired into this workflow; review is incomplete.' >&2\n  exit 1\nfi`],
    ['unconditional fake', `echo 'SELECTED_PROVIDER != codex'\necho 'Selected reviewer provider is not wired'\nexit 1`],
    ['comment only', `# if test -n "$SELECTED_PROVIDER" && test "$SELECTED_PROVIDER" != codex; then\n#   echo 'Selected reviewer provider is not wired into this workflow; review is incomplete.' >&2\n#   exit 1\n# fi`],
  ];
  for (const profile of ['consumer', 'self']) {
    for (const [label, run] of providerMutations) {
      const data = workflows();
      data[profile].jobs.policy.steps.find(step => step.name === 'Reject unwired reviewer providers').run = run;
      assert.throws(() => assertWorkflowStructure(data), /provider guard must retain its selected-provider condition/, `${profile} provider guard accepted ${label}`);
    }
  }

  const amendmentMutations = [
    ['removed condition', `echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\nexit 1`],
    ['inverted condition', `if test "$OWNER_AMENDMENT_GRADE" != G0; then\n  echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\n  exit 1\nfi`],
    ['unconditional fake', `echo 'OWNER_AMENDMENT_GRADE G0'\necho 'OWNER_AMENDMENT is supported only by the protected self workflow'\nexit 1`],
    ['comment only', `# if test "$OWNER_AMENDMENT_GRADE" = G0; then\n#   echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\n#   exit 1\n# fi`],
  ];
  for (const [label, run] of amendmentMutations) {
    const data = workflows();
    data.consumer.jobs.policy.steps.find(step => step.name === 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow').run = run;
    assert.throws(() => assertWorkflowStructure(data), /consumer amendment guard must retain its G0 condition/, `consumer amendment guard accepted ${label}`);
  }
});

test('comments, formatting, and mapping key order do not alter structural validation', () => {
  const data = workflows();
  const commented = parseWorkflow(`# permissions: id-token: write; needs: [missing]; uses: openai/codex-action@wrong\n${source.consumer}`, 'comment positive fixture');
  assertWorkflowStructure({ ...data, consumer: commented });

  const reordered = Object.fromEntries(Object.entries(data.consumer).reverse());
  const yamlWithReorderedKeysAndFormatting = `# harmless comment\n${stringify(reordered, { indent: 4, lineWidth: 100 })}`;
  assertWorkflowStructure({ ...data, consumer: parseWorkflow(yamlWithReorderedKeysAndFormatting, 'reordered positive fixture') });
});

test('malformed YAML and duplicate mapping keys fail before invariant checks', () => {
  assert.throws(() => parseWorkflow('jobs:\n  policy: {}\n  policy: {}\n', 'duplicate fixture'), /duplicate keys/);
  assert.throws(() => parseWorkflow('jobs: [\n', 'malformed fixture'), /valid YAML/);
});


test('missing and relative runtime outputs cannot run the candidate build', () => {
  const root = mkdtempSync(join(tmpdir(), 'agk-empty-runtime-'));
  try {
    for (const profile of ['consumer', 'self']) for (const job of ['policy', 'review']) for (const [label, output] of [['empty', ''], ['relative', '.']]) {
      const candidate = join(root, `${profile}-${job}-${label}`);
      mkdirSync(candidate);
      const pkg = { name: 'empty-runtime-fixture', version: '1.0.0', scripts: { build: 'node build-marker.mjs' } };
      writeFileSync(join(candidate, 'package.json'), JSON.stringify(pkg));
      writeFileSync(join(candidate, 'package-lock.json'), JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages: { '': { name: pkg.name, version: pkg.version } } }));
      writeFileSync(join(candidate, 'build-marker.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('candidate-build-ran', 'yes');\n");
      const block = workflows()[profile].jobs[job].steps.find(step => step.name === (job === 'policy' ? 'Build the pinned protected runtime' : 'Build the pinned validation runtime')).run;
      const invoke = script => spawnSync('/bin/bash', ['-e', '-c', script], {
        cwd: candidate, encoding: 'utf8',
        env: { ...process.env, GATEKEEPER_RUNTIME_ROOT: output, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_cache: join(root, 'npm-cache') },
      });
      const marker = join(candidate, 'candidate-build-ran');
      const oldBehavior = invoke(block.slice(block.indexOf('cd "$GATEKEEPER_RUNTIME_ROOT"')));
      assert.equal(oldBehavior.status, 0, oldBehavior.stderr);
      assert.equal(existsSync(marker), true, `${profile}.${job}: control must execute candidate build`);
      rmSync(marker);
      const fixed = invoke(block);
      assert.notEqual(fixed.status, 0, `${profile}.${job}: ${label} output must fail`);
      assert.equal(existsSync(marker), false, `${profile}.${job}: candidate build must not run`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
