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
};
const workflows = () => Object.fromEntries(Object.entries(source).map(([key, text]) => [key, parseWorkflow(text, key)]));
const valid = () => assertWorkflowStructure(workflows());

test('production workflow files satisfy parsed structural invariants', valid);

test('review jobs validate and check out the immutable event merge commit', () => {
  const mergeSha = '${{ github.event.pull_request.merge_commit_sha }}';
  const workflowsToCheck = workflows();
  const runInline = (script, env) => spawnSync('/bin/bash', ['-e', '-u', '-o', 'pipefail', '-c', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

  for (const profile of ['consumer', 'self']) {
    const steps = workflowsToCheck[profile].jobs.review.steps;
    const guardIndex = steps.findIndex(step => step.name === 'Validate immutable pull request merge revision');
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@') && step.with?.ref === mergeSha);
    const recordIndex = steps.findIndex(step => step.name === 'Record reviewed merge revision');
    const buildIndex = steps.findIndex(step => step.name === 'Build the pinned validation runtime');
    assert.ok(guardIndex > steps.findIndex(step => step.name === 'Check enforced credentials'), `${profile} guard follows credential check`);
    assert.ok(checkoutIndex > guardIndex, `${profile} immutable guard precedes candidate checkout`);
    assert.ok(recordIndex > checkoutIndex, `${profile} HEAD assertion follows candidate checkout`);
    assert.ok(buildIndex > recordIndex, `${profile} exact merge tuple check precedes runtime build`);

    const guard = steps[guardIndex];
    assert.deepEqual(guard.env, { MERGE_SHA: mergeSha });
    assert.match(guard.run, /process\.env\.MERGE_SHA/);
    assert.match(guard.run, /sha\.length !== 40/);
    assert.match(guard.run, /\^\[a-f0-9\]\{40\}\$/);
    assert.equal(steps[checkoutIndex].with['fetch-depth'], 0);
    assert.equal(steps[checkoutIndex].with.submodules, "${{ needs.policy.outputs.authority_manifest_path == '' && 'recursive' || 'false' }}");
    assert.equal(steps[checkoutIndex].with.token, "${{ needs.policy.outputs.authority_manifest_path == '' && secrets.CI_SOURCE_READ_TOKEN || github.token }}");
    assert.equal(steps[checkoutIndex].with['persist-credentials'], false);
    assert.ok(!steps[checkoutIndex].with.ref.includes('refs/pull/'), `${profile} checkout must not resolve a moving pull request ref`);

    const record = steps[recordIndex];
    assert.equal(record.id, 'revision');
    assert.deepEqual(record.env, {
      EXPECTED_MERGE_SHA: mergeSha,
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    assert.match(record.run, /git rev-parse HEAD/);
    assert.match(record.run, /actual_sha.*!=.*EXPECTED_MERGE_SHA/);
    assert.match(record.run, /git --no-replace-objects rev-list --parents -n 1/);
    assert.match(record.run, /actual_parents.*!=.*expected_parents/);
    assert.ok(record.run.indexOf('actual_sha') < record.run.indexOf('GITHUB_OUTPUT'), `${profile} output is written after comparison`);
    assert.ok(record.run.indexOf('actual_parents') < record.run.indexOf('GITHUB_OUTPUT'), `${profile} output follows the exact parent tuple check`);
    assert.match(record.run, /printf 'sha=%s\\n' "\$EXPECTED_MERGE_SHA"/);
    const context = steps.find(step => step.name === 'Attach exact pull request task context to protected review');
    assert.equal(context.env.BASE_SHA, '${{ github.event.pull_request.base.sha }}');
    assert.equal(context.env.HEAD_SHA, '${{ github.event.pull_request.head.sha }}');
    assert.equal(context.env.REVIEWED_SHA, '${{ steps.revision.outputs.sha }}');

    const validSha = 'a'.repeat(40);
    assert.equal(runInline(guard.run, { MERGE_SHA: validSha }).status, 0, `${profile} accepts a valid immutable SHA`);
    for (const [label, value] of [
      ['missing', undefined],
      ['empty/null representation', ''],
      ['short', 'a'.repeat(39)],
      ['invalid character', 'a'.repeat(39) + 'g'],
      ['uppercase', 'A'.repeat(40)],
      ['embedded newline', 'a'.repeat(39) + '\n'],
      ['mutable pull request ref', 'refs/pull/42/merge'],
    ]) {
      const env = { MERGE_SHA: value };
      if (value === undefined) delete env.MERGE_SHA;
      assert.notEqual(runInline(guard.run, env).status, 0, `${profile} rejects ${label}`);
    }
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
    writeFileSync(join(repository, 'head.txt'), 'candidate head snapshot\n');
    git('add', 'head.txt');
    git('commit', '-q', '-m', 'candidate head snapshot');
    const head = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'base');
    git('merge', '--no-ff', '--no-edit', 'candidate');
    const merge = git('rev-parse', 'HEAD');
    assert.match(merge, /^[a-f0-9]{40}$/);

    const record = workflowsToCheck.consumer.jobs.review.steps.find(step => step.name === 'Record reviewed merge revision');
    const outputPath = join(root, 'github-output');
    writeFileSync(outputPath, '');
    const matching = spawnSync('/bin/bash', ['-e', '-u', '-o', 'pipefail', '-c', record.run], {
      cwd: repository,
      env: { ...process.env, EXPECTED_MERGE_SHA: merge, BASE_SHA: base, HEAD_SHA: head, GITHUB_OUTPUT: outputPath },
      encoding: 'utf8',
    });
    assert.equal(matching.status, 0, matching.stderr);
    assert.equal(readFileSync(outputPath, 'utf8'), `sha=${merge}\n`);

    const rejectedTuples = [
      ['mismatched merge SHA', { EXPECTED_MERGE_SHA: 'b'.repeat(40), BASE_SHA: base, HEAD_SHA: head }],
      ['swapped event parents', { EXPECTED_MERGE_SHA: merge, BASE_SHA: head, HEAD_SHA: base }],
      ['stale event base', { EXPECTED_MERGE_SHA: merge, BASE_SHA: 'c'.repeat(40), HEAD_SHA: head }],
      ['missing event base', { EXPECTED_MERGE_SHA: merge, BASE_SHA: '', HEAD_SHA: head }],
      ['missing event head', { EXPECTED_MERGE_SHA: merge, BASE_SHA: base, HEAD_SHA: '' }],
    ];
    for (const [label, tuple] of rejectedTuples) {
      writeFileSync(outputPath, '');
      const rejected = spawnSync('/bin/bash', ['-e', '-u', '-o', 'pipefail', '-c', record.run], {
        cwd: repository,
        env: { ...process.env, ...tuple, GITHUB_OUTPUT: outputPath },
        encoding: 'utf8',
      });
      assert.notEqual(rejected.status, 0, `${label} fails the trusted merge guard`);
      assert.equal(readFileSync(outputPath, 'utf8'), '', `${label} emits no reviewed revision`);
    }
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

        const node = steps[index + 1];
        const build = steps[index + 2];
        assert.equal(node.uses, 'actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f', `${profile}.${jobName} Node pin`);
        assert.equal(node.with['node-version'], 22, `${profile}.${jobName} Node version`);
        assert.match(build.name, /^Build the pinned (protected|validation) runtime$/);
        assert.match(build.run, new RegExp(`npm ci --ignore-scripts --prefix ${runtimePath.replaceAll('.', '\\.')}`));
        assert.match(build.run, new RegExp(`npm run --prefix ${runtimePath.replaceAll('.', '\\.') } build`));
        if (checkout.if !== undefined) assert.equal(build.if, checkout.if, `${profile}.${jobName} conditional runtime selection`);

        const laterRuntimeCalls = steps.slice(index + 3).map(step => `${step.run ?? ''}\n${step.env ? JSON.stringify(step.env) : ''}`).join('\n');
        assert.doesNotMatch(laterRuntimeCalls, new RegExp(`${runtimePath.replaceAll('.', '\\.')}/src/`));
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
