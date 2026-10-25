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

test('review jobs recover stale merge metadata once and validate exact ordered event parents', t => {
  const mergeSha = '${{ github.event.pull_request.merge_commit_sha }}';
  const workflowsToCheck = workflows();
  const checkedScripts = [];
  const fixtureDir = mkdtempSync(join(tmpdir(), 'agk-verified-merge-'));
  const fakeGitPath = join(fixtureDir, 'git');
  writeFileSync(fakeGitPath, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.GIT_CALL_LOG, JSON.stringify({
  args,
  scopedAuth: process.env.GIT_CONFIG_KEY_0 === 'http.https://github.com/.extraheader' &&
    process.env.GIT_CONFIG_VALUE_0?.startsWith('AUTHORIZATION: basic '),
  noninteractive: process.env.GIT_TERMINAL_PROMPT === '0' &&
    process.env.GIT_ASKPASS === '/bin/false' && process.env.SSH_ASKPASS === '/bin/false',
  fetchTokenAbsent: !Object.hasOwn(process.env, 'FETCH_TOKEN'),
}) + '\\n');
if (args.includes('ls-remote')) {
  if (process.env.LOOKUP_STATUS !== '0') process.exit(Number(process.env.LOOKUP_STATUS));
  process.stdout.write(process.env.LOOKUP_OUTPUT ?? '');
} else if (args.includes('fetch')) {
  if (process.env.FETCH_STATUS !== '0') process.exit(Number(process.env.FETCH_STATUS));
} else if (args.includes('cat-file')) {
  process.stdout.write((process.env.OBJECT_TYPE ?? 'commit') + '\\n');
} else if (args.includes('rev-parse')) {
  process.stdout.write((process.env.REVPARSE_SHA ?? process.env.CANDIDATE_SHA) + '\\n');
} else if (args.includes('rev-list')) {
  process.stdout.write((process.env.PARENT_LINE ?? (process.env.CANDIDATE_SHA + ' ' + process.env.BASE_SHA + ' ' + process.env.HEAD_SHA)) + '\\n');
} else if (args[0] === 'submodule' && args[1] === 'deinit') {
  if (process.env.DEINIT_STATUS && process.env.DEINIT_STATUS !== '0') process.exit(Number(process.env.DEINIT_STATUS));
} else {
  process.exit(91);
}
`);
  chmodSync(fakeGitPath, 0o755);
  const fakeTimeoutPath = join(fixtureDir, 'timeout');
  writeFileSync(fakeTimeoutPath, '#!/bin/sh\ntest "$1" = 30s || exit 99\nshift\nexec "$@"\n');
  chmodSync(fakeTimeoutPath, 0o755);
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const callsPath = join(fixtureDir, 'git-calls.jsonl');
  const outputPath = join(fixtureDir, 'github-output');
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
    const resolveIndex = steps.findIndex(step => step.name === 'Fetch and verify current pull request merge commit');
    const selectIndex = steps.findIndex(step => step.name === 'Select validated pull request merge commit');
    const refreshIndex = steps.findIndex(step => step.name === 'Materialize selected pull request merge revision');
    const recordIndex = steps.findIndex(step => step.name === 'Record reviewed merge revision');
    const buildIndex = steps.findIndex(step => step.name === 'Build the pinned validation runtime' || step.name === 'Build the pinned protected runtime');
    assert.ok(guardIndex > steps.findIndex(step => step.name === 'Check enforced credentials'), `${profile} guard follows credential check`);
    assert.ok(checkoutIndex > guardIndex, `${profile} immutable checkout follows event tuple guard`);
    assert.ok(metadataIndex > checkoutIndex, `${profile} metadata comparison follows initial checkout`);
    assert.ok(resolveIndex > metadataIndex && selectIndex > resolveIndex && refreshIndex > selectIndex && refreshIndex < recordIndex,
      `${profile} selected immutable object is validated before final checkout and revision record`);
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
    assert.equal(steps[checkoutIndex].with.submodules, false, `${profile} initial checkout defers submodule materialization`);
    assert.equal(steps[checkoutIndex].with.token, "${{ needs.policy.outputs.authority_manifest_path == '' && secrets.CI_SOURCE_READ_TOKEN || github.token }}");
    assert.equal(steps[checkoutIndex].with['persist-credentials'], false);
    assert.ok(!steps[checkoutIndex].with.ref.includes('refs/pull/'), `${profile} initial checkout uses the immutable event SHA`);

    const resolver = steps[resolveIndex];
    assert.equal(resolver.id, 'verified_merge_commit');
    assert.equal(resolver.if, "steps.event_revision.outputs.refresh == 'true'");
    assert.equal(resolver['timeout-minutes'], 2, `${profile} merge lookup and fetch have a bounded step timeout`);
    assert.deepEqual(resolver.env, {
      FETCH_TOKEN: steps[checkoutIndex].with.token,
      REPOSITORY: '${{ github.repository }}',
      SERVER_URL: '${{ github.server_url }}',
      PR_NUMBER: '${{ github.event.pull_request.number }}',
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    assert.match(resolver.run, /timeout 30s git "\$@"/);
    assert.match(resolver.run, /ls-remote --refs "\$REMOTE_URL" "\$MERGE_REF"/);
    assert.match(resolver.run, /fetch --no-tags --no-recurse-submodules --no-write-fetch-head/);
    assert.match(resolver.run, /"\$REMOTE_URL" "\$REFRESHED_SHA"/);
    assert.match(resolver.run, /git --no-replace-objects cat-file -t "\$REFRESHED_SHA"/);
    assert.match(resolver.run, /OBJECT_TYPE.*commit/);
    assert.match(resolver.run, /git --no-replace-objects rev-list --parents -n 1 "\$REFRESHED_SHA"/);
    assert.match(resolver.run, /ACTUAL_PARENTS.*EXPECTED_PARENTS/);
    assert.ok(resolver.run.indexOf('ACTUAL_PARENTS') < resolver.run.indexOf('GITHUB_OUTPUT'), `${profile} emits only after exact parent verification`);
    assert.match(resolver.run, /GIT_CONFIG_KEY_0=.*http\..*extraheader/);
    assert.match(resolver.run, /echo \"::add-mask::\$AUTH\"/);
    assert.ok(resolver.run.indexOf('::add-mask::$AUTH') < resolver.run.indexOf('ls-remote') &&
      resolver.run.indexOf('ls-remote') < resolver.run.indexOf('fetch --no-tags'), `${profile} masks authorization before both network commands`);
    assert.match(resolver.run, /REFRESHED_SHA.*\^\[a-f0-9\]\{40\}\$/);
    assert.match(resolver.run, /REFRESHED_REF.*MERGE_REF/);
    const selected = steps[selectIndex];
    assert.equal(selected.id, 'selected_merge_commit');
    assert.deepEqual(selected.env, {
      EXPECTED_MERGE_SHA: mergeSha,
      REFRESH: '${{ steps.event_revision.outputs.refresh }}',
      REFRESHED_SHA: '${{ steps.verified_merge_commit.outputs.sha }}',
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      SUBMODULES_ENABLED: "${{ needs.policy.outputs.authority_manifest_path == '' }}",
    });
    assert.match(selected.run, /SELECTED_SHA=.*REFRESHED_SHA/);
    assert.match(selected.run, /SELECTED_SHA=.*EXPECTED_MERGE_SHA/);
    assert.match(selected.run, /cat-file -t "\$SELECTED_SHA"/);
    assert.match(selected.run, /rev-list --parents -n 1 "\$SELECTED_SHA"/);
    assert.ok(selected.run.indexOf('ACTUAL_PARENTS') < selected.run.indexOf('submodule deinit') &&
      selected.run.indexOf('submodule deinit') < selected.run.indexOf('GITHUB_OUTPUT'),
    `${profile} clears stale submodule worktrees after validating parents and before exposing the SHA`);
    assert.match(selected.run, /timeout 30s env GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=\/bin\/false SSH_ASKPASS=\/bin\/false git submodule deinit --force --all/);
    assert.match(selected.run, /printf 'sha=%s\\n' "\$SELECTED_SHA"/);
    const refresh = steps[refreshIndex];
    assert.equal(refresh.if, "steps.event_revision.outputs.refresh == 'true' || needs.policy.outputs.authority_manifest_path == ''");
    assert.equal(refresh.with.ref, '${{ steps.selected_merge_commit.outputs.sha }}');
    assert.equal(refresh['continue-on-error'], undefined, `${profile} invalid candidates stop before refreshed checkout`);
    assert.equal(refresh.with['fetch-depth'], 0, `${profile} selected checkout fetches full merge history`);
    assert.equal(refresh['timeout-minutes'], 3, `${profile} selected checkout has a bounded timeout`);
    assert.equal(refresh.with.submodules, "${{ needs.policy.outputs.authority_manifest_path == '' && 'recursive' || 'false' }}",
      `${profile} only final selected checkout recursively materializes policy-selected submodules`);
    assert.equal(refresh.with.token, steps[checkoutIndex].with.token, `${profile} refresh uses the same read-only checkout token selection`);
    assert.equal(refresh.with['persist-credentials'], false);

    const metadata = steps[metadataIndex];
    checkedScripts.push({ profile, metadata: metadata.run, resolver: resolver.run, selected: selected.run, record: steps[recordIndex].run });
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
      SELECTED_SHA: '${{ steps.selected_merge_commit.outputs.sha }}',
      BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    });
    assert.match(record.run, /git rev-parse HEAD/);
    assert.match(record.run, /git --no-replace-objects rev-list --parents -n 1/);
    assert.match(record.run, /actual_parents.*!=.*expected_parents/);
    assert.match(record.run, /actual_sha.*SELECTED_SHA/);
    assert.match(record.run, /printf 'sha=%s\\n' "\$actual_sha"/);
    const context = steps.find(step => step.name === 'Attach exact pull request task context to protected review');
    if (context) assert.equal(context.env.REVIEWED_SHA, '${{ steps.revision.outputs.sha }}');

    // Execute the exact resolver shell with controlled Git behavior. The
    // refreshed checkout is gated on this step succeeding, so a rejected
    // candidate must leave no SHA output for actions/checkout to consume.
    const candidateSha = 'd'.repeat(40);
    const baseSha = 'b'.repeat(40);
    const headSha = 'c'.repeat(40);
    const mergeRef = 'refs/pull/42/merge';
    const configuredResolverInputs = {
      FETCH_TOKEN: 'test-read-token', REPOSITORY: 'flair-agency/architecture-gatekeeper',
      SERVER_URL: 'https://github.com', PR_NUMBER: '42', BASE_SHA: baseSha, HEAD_SHA: headSha,
    };
    const resolverEnv = overrides => ({
      ...Object.fromEntries(Object.keys(resolver.env).map(name => [name, configuredResolverInputs[name]])),
      GITHUB_OUTPUT: outputPath, GIT_CALL_LOG: callsPath,
      LOOKUP_STATUS: '0', LOOKUP_OUTPUT: `${candidateSha}\t${mergeRef}\n`, FETCH_STATUS: '0',
      CANDIDATE_SHA: candidateSha, REVPARSE_SHA: candidateSha, OBJECT_TYPE: 'commit',
      PARENT_LINE: `${candidateSha} ${baseSha} ${headSha}`,
      PATH: `${fixtureDir}:${process.env.PATH}`,
      ...overrides,
    });
    const runResolver = overrides => {
      writeFileSync(outputPath, '');
      writeFileSync(callsPath, '');
      const result = runInline(resolver.run, resolverEnv(overrides), fixtureDir);
      const calls = readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      return { result, output: readFileSync(outputPath, 'utf8'), calls };
    };
    const accepted = runResolver({});
    assert.equal(accepted.result.status, 0, `${profile} accepts exact fetched merge commit: ${accepted.result.stderr}`);
    assert.equal(accepted.output, `sha=${candidateSha}\n`);
    assert.equal(accepted.calls.filter(call => call.args.includes('ls-remote')).length, 1);
    assert.deepEqual(accepted.calls.find(call => call.args.includes('fetch')).args, [
      'fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head',
      'https://github.com/flair-agency/architecture-gatekeeper.git', candidateSha,
    ]);
    assert.equal(accepted.calls.filter(call => call.args.includes('rev-list')).length, 1);
    assert.ok(accepted.calls.filter(call => call.args.includes('ls-remote') || call.args.includes('fetch'))
      .every(call => call.scopedAuth && call.noninteractive), `${profile} scopes noninteractive auth to both network commands`);
    assert.doesNotMatch(JSON.stringify(accepted.calls), /test-read-token|AUTHORIZATION:/,
      `${profile} does not place credentials on Git argv or in captured logs`);

    const selectedEnv = overrides => ({
      EXPECTED_MERGE_SHA: candidateSha, REFRESH: 'true', REFRESHED_SHA: candidateSha,
      BASE_SHA: baseSha, HEAD_SHA: headSha, SUBMODULES_ENABLED: 'true',
      CANDIDATE_SHA: candidateSha, OBJECT_TYPE: 'commit',
      PARENT_LINE: `${candidateSha} ${baseSha} ${headSha}`,
      DEINIT_STATUS: '0', PATH: `${fixtureDir}:${process.env.PATH}`,
      GITHUB_OUTPUT: outputPath, GIT_CALL_LOG: callsPath,
      ...overrides,
    });
    const runSelected = overrides => {
      writeFileSync(outputPath, '');
      writeFileSync(callsPath, '');
      const result = runInline(selected.run, selectedEnv(overrides), fixtureDir);
      const calls = readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      return { result, output: readFileSync(outputPath, 'utf8'), calls };
    };
    const selectedRefreshed = runSelected({});
    assert.equal(selectedRefreshed.result.status, 0, `${profile} selects validated refreshed SHA before checkout`);
    assert.equal(selectedRefreshed.output, `sha=${candidateSha}\n`);
    assert.deepEqual(selectedRefreshed.calls.map(call => call.args), [
      ['--no-replace-objects', 'cat-file', '-t', candidateSha],
      ['--no-replace-objects', 'rev-list', '--parents', '-n', '1', candidateSha],
      ['submodule', 'deinit', '--force', '--all'],
    ]);
    assert.equal(selectedRefreshed.calls.at(-1).fetchTokenAbsent, true,
      `${profile} selected checkout cleanup receives no source token`);
    const selectedNormal = runSelected({
      REFRESH: 'false', REFRESHED_SHA: '', SUBMODULES_ENABLED: 'false',
    });
    assert.equal(selectedNormal.result.status, 0, `${profile} selects the exact event SHA on the normal path`);
    assert.equal(selectedNormal.output, `sha=${candidateSha}\n`);
    assert.equal(selectedNormal.calls.some(call => call.args[0] === 'submodule'), false,
      `${profile} skips submodule cleanup when submodules are not selected`);
    const cleanupFailure = runSelected({ DEINIT_STATUS: '9' });
    assert.notEqual(cleanupFailure.result.status, 0, `${profile} blocks selected checkout when cleanup fails`);
    assert.equal(cleanupFailure.output, '', `${profile} cleanup failure emits no selected checkout SHA`);

    const rejectedCandidates = [
      ['missing ref', { LOOKUP_OUTPUT: '' }],
      ['ambiguous refs', { LOOKUP_OUTPUT: `${candidateSha}\t${mergeRef}\n${candidateSha}\t${mergeRef}\n` }],
      ['malformed SHA', { LOOKUP_OUTPUT: `bad\t${mergeRef}\n` }],
      ['unexpected ref', { LOOKUP_OUTPUT: `${candidateSha}\trefs/pull/99/merge\n` }],
      ['extra ref data', { LOOKUP_OUTPUT: `${candidateSha}\t${mergeRef} extra\n` }],
      ['lookup network failure', { LOOKUP_STATUS: '7' }],
      ['fetch failure', { FETCH_STATUS: '9' }],
      ['tag object', { OBJECT_TYPE: 'tag' }],
      ['blob object', { OBJECT_TYPE: 'blob' }],
      ['different fetched object', { REVPARSE_SHA: 'e'.repeat(40) }],
      ['reversed parents', { PARENT_LINE: `${candidateSha} ${headSha} ${baseSha}` }],
      ['different base', { PARENT_LINE: `${candidateSha} ${'f'.repeat(40)} ${headSha}` }],
      ['different head', { PARENT_LINE: `${candidateSha} ${baseSha} ${'e'.repeat(40)}` }],
      ['missing parent', { PARENT_LINE: `${candidateSha} ${baseSha}` }],
      ['extra parent', { PARENT_LINE: `${candidateSha} ${baseSha} ${headSha} ${'f'.repeat(40)}` }],
    ];
    for (const [label, overrides] of rejectedCandidates) {
      const rejected = runResolver(overrides);
      assert.notEqual(rejected.result.status, 0, `${profile} rejects ${label}`);
      assert.equal(rejected.output, '', `${profile} emits no SHA for ${label}`);
      assert.ok(rejected.result.stderr.length > 0, `${profile} diagnoses ${label}`);
      assert.equal(rejected.calls.filter(call => call.args.includes('ls-remote')).length, 1,
        `${profile} performs exactly one merge-ref lookup for ${label}`);
      if (label === 'fetch failure') assert.equal(rejected.calls.some(call => call.args.includes('cat-file')), false);
      if (['missing ref', 'ambiguous refs', 'malformed SHA', 'unexpected ref', 'extra ref data', 'lookup network failure'].includes(label)) {
        assert.equal(rejected.calls.some(call => call.args.includes('fetch')), false, `${profile} does not fetch ${label}`);
      }
    }

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
  assert.equal(checkedScripts[1].selected, checkedScripts[0].selected, 'self and consumer selected revision guards stay aligned');
  assert.equal(checkedScripts[2].selected, checkedScripts[0].selected, 'provider and consumer selected revision guards stay aligned');
  assert.equal(checkedScripts[1].record, checkedScripts[0].record, 'self and consumer final validation stay aligned');
  assert.equal(checkedScripts[2].record, checkedScripts[0].record, 'provider and consumer final validation stay aligned');
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
    const selection = workflow.find(step => step.name === 'Select validated pull request merge commit');
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
    const normalSelection = runInline(selection.run, {
      EXPECTED_MERGE_SHA: staleMerge, REFRESH: 'false', REFRESHED_SHA: '', BASE_SHA: base,
      HEAD_SHA: previousHead, SUBMODULES_ENABLED: 'false', GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.equal(normalSelection.status, 0, normalSelection.stderr);
    assert.equal(readFileSync(outputPath, 'utf8'), `sha=${staleMerge}\n`);
    writeFileSync(outputPath, '');
    const normalRecord = runInline(record.run, {
      SELECTED_SHA: staleMerge, BASE_SHA: base, HEAD_SHA: previousHead, GITHUB_OUTPUT: outputPath,
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
    writeFileSync(outputPath, '');
    const recoveredSelection = runInline(selection.run, {
      EXPECTED_MERGE_SHA: staleMerge, REFRESH: 'true', REFRESHED_SHA: freshMerge,
      BASE_SHA: base, HEAD_SHA: currentHead, SUBMODULES_ENABLED: 'false', GITHUB_OUTPUT: outputPath,
    }, repository);
    assert.equal(recoveredSelection.status, 0, recoveredSelection.stderr);
    assert.equal(readFileSync(outputPath, 'utf8'), `sha=${freshMerge}\n`);
    git('checkout', '--detach', freshMerge); // models checkout of the single resolved immutable merge SHA
    writeFileSync(outputPath, '');
    const recovered = runInline(record.run, {
      SELECTED_SHA: freshMerge, BASE_SHA: base, HEAD_SHA: currentHead, GITHUB_OUTPUT: outputPath,
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
      writeFileSync(outputPath, '');
      const rejectedSelection = runInline(selection.run, {
        EXPECTED_MERGE_SHA: staleMerge, REFRESH: 'true', REFRESHED_SHA: candidate,
        BASE_SHA: base, HEAD_SHA: currentHead, SUBMODULES_ENABLED: 'false', GITHUB_OUTPUT: outputPath,
      }, repository);
      assert.notEqual(rejectedSelection.status, 0, `${label} is rejected before selected checkout`);
      assert.equal(readFileSync(outputPath, 'utf8'), '', `${label} emits no selected checkout SHA`);
      git('checkout', '--detach', candidate);
      writeFileSync(outputPath, '');
      const rejected = runInline(record.run, {
        SELECTED_SHA: candidate, BASE_SHA: base, HEAD_SHA: currentHead, GITHUB_OUTPUT: outputPath,
      }, repository);
      assert.notEqual(rejected.status, 0, `${label} fails closed after refresh`);
      assert.equal(readFileSync(outputPath, 'utf8'), '', `${label} emits no reviewed SHA`);
    }

    // A refresh that is skipped or remains stale cannot silently accept the old SHA.
    git('checkout', '--detach', staleMerge);
    writeFileSync(outputPath, '');
    const persistent = runInline(record.run, {
      SELECTED_SHA: freshMerge, BASE_SHA: base, HEAD_SHA: currentHead, GITHUB_OUTPUT: outputPath,
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
  misplacedSelfDependency.self.jobs['owner-amendment'].needs = ['policy', 'owner-addition'];
  assert.throws(() => assertWorkflowStructure(misplacedSelfDependency), /one amendment job follows policy, ordinary review, and optional addition/);
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

    const providerAmendmentGuardDisabled = workflows();
    providerAmendmentGuardDisabled.providers.jobs.policy.steps.find(candidate => candidate.name === 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow').if = disabledValue;
    assert.throws(() => assertWorkflowStructure(providerAmendmentGuardDisabled), /provider-workflow OWNER_AMENDMENT guard must always run/);
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
    ['inverted condition', `if test -z "$OWNER_AMENDMENT_ACCEPTANCE"; then\n  echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\n  exit 1\nfi`],
    ['unconditional fake', `echo 'OWNER_AMENDMENT_ACCEPTANCE protected-pr'\necho 'OWNER_AMENDMENT is supported only by the protected self workflow'\nexit 1`],
    ['comment only', `# if test -n "$OWNER_AMENDMENT_ACCEPTANCE"; then\n#   echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\n#   exit 1\n# fi`],
  ];
  for (const profile of ['consumer', 'providers']) {
    for (const [label, run] of amendmentMutations) {
      const data = workflows();
      data[profile].jobs.policy.steps.find(step => step.name === 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow').run = run;
      assert.throws(() => assertWorkflowStructure(data), /amendment guard must reject the self-only selection/, `${profile} amendment guard accepted ${label}`);
    }
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
