import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseWorkflow } from './helpers/workflow-structure.mjs';

function measurementJob(filename) {
  return parseWorkflow(readFileSync(new URL(`../.github/workflows/${filename}`, import.meta.url), 'utf8')).jobs.measurement;
}
function assertCredentialFree(job) {
  assert.deepEqual(job.permissions, {});
  assert.ok(!JSON.stringify(job).includes('github.token'));
  assert.ok(!JSON.stringify(job).includes('secrets.'));
  assert.ok(!job.steps.some(step => step.uses?.startsWith('actions/checkout@')));
  const setup = job.steps.find(step => step.uses?.startsWith('actions/setup-node@'));
  assert.equal(setup.with.token, ''); assert.equal(setup.with['package-manager-cache'], false);
  const fetch = job.steps.find(step => step.name === 'Fetch the public pinned diagnostic runtime without credentials');
  assert.equal(fetch.env.RUNTIME_REPOSITORY, '${{ job.workflow_repository }}');
  assert.equal(fetch.env.RUNTIME_SHA, '${{ job.workflow_sha }}');
  assert.equal(fetch.env.RUNTIME_SERVER, '${{ github.server_url }}');
  assert.equal(fetch.env.GIT_TERMINAL_PROMPT, '0'); assert.equal(fetch.env.GIT_ASKPASS, '/bin/false');
  assert.equal(fetch.env.GIT_CONFIG_GLOBAL, '/dev/null'); assert.equal(fetch.env.GIT_CONFIG_NOSYSTEM, '1');
  assert.match(fetch.run, /git -c credential\.helper= -c http\.extraheader= fetch/);
  return fetch;
}

for (const filename of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
  test(`${filename} optional bootstrap adds no repository permission or action-default token`, () => {
    const original = measurementJob(filename); assertCredentialFree(original);
    const mutations = [
      job => { job.permissions.contents = 'read'; },
      job => { job.steps[0].uses = 'actions/checkout@v5'; },
      job => { delete job.steps.find(s => s.uses?.startsWith('actions/setup-node@')).with.token; },
      job => { job.steps[0].env.EXTRA_TOKEN = '${{ github.token }}'; },
      job => { job.steps[0].env.EXTRA_TOKEN = '${{ secrets.SOURCE_TOKEN }}'; },
      job => { job.steps[0].run = job.steps[0].run.replace('-c credential.helper= ', ''); },
    ];
    for (const mutate of mutations) { const broken = structuredClone(original); mutate(broken); assert.throws(() => assertCredentialFree(broken)); }
  });

  test(`${filename} executes exact anonymous fetch, rejects malformed selection and wrong fetched SHA`, t => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'agk-anonymous-bootstrap-')); t.after(() => rmSync(root, { recursive: true, force: true }));
    const fetch = assertCredentialFree(measurementJob(filename));
    const git = join(root, 'git'); const log = join(root, 'git.log');
    writeFileSync(git, `#!/usr/bin/env node
      const fs = require('node:fs'); const args = process.argv.slice(2);
      fs.appendFileSync(process.env.GIT_CALL_LOG, JSON.stringify(args)+'\\n');
      if (args.includes('fetch')) {
        if (!args.includes('credential.helper=') || !args.includes('http.extraheader=')) process.exit(97);
        if (process.env.GIT_CONFIG_GLOBAL !== '/dev/null' || process.env.GIT_CONFIG_NOSYSTEM !== '1' || process.env.GIT_TERMINAL_PROMPT !== '0' || process.env.GIT_ASKPASS !== '/bin/false') process.exit(98);
      }
      if (args[0] === 'rev-parse') process.stdout.write(process.env.FETCHED_SHA || process.env.RUNTIME_SHA);
    `); chmodSync(git, 0o755);
    const env = { ...process.env, ...fetch.env, RUNTIME_SERVER: 'https://github.com', RUNTIME_REPOSITORY: 'flair-agency/architecture-gatekeeper', RUNTIME_SHA: 'a'.repeat(40),
      PATH: root + delimiter + process.env.PATH, GIT_CALL_LOG: log, GITHUB_TOKEN: 'poison-token', GH_TOKEN: 'poison-token',
      GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: 'poison-helper', GIT_CONFIG_KEY_1: 'http.extraheader', GIT_CONFIG_VALUE_1: 'poison-header' };
    const run = overrides => { writeFileSync(log, ''); return spawnSync('bash', ['-c', fetch.run], { cwd: root, env: { ...env, ...overrides }, encoding: 'utf8' }); };
    let result = run({}); assert.equal(result.status, 0, result.stderr);
    let calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls, [['init', '.'], ['-c', 'credential.helper=', '-c', 'http.extraheader=', 'fetch', '--no-tags', '--depth=1', 'https://github.com/flair-agency/architecture-gatekeeper.git', 'a'.repeat(40)],
      ['rev-parse', 'FETCH_HEAD'], ['checkout', '--detach', 'a'.repeat(40)]]);
    assert.ok(!readFileSync(log, 'utf8').includes('poison'));
    for (const overrides of [{ RUNTIME_REPOSITORY: 'owner/../repository' }, { RUNTIME_REPOSITORY: 'owner/..' }, { RUNTIME_REPOSITORY: 'owner/repo; echo poison' },
      { RUNTIME_SHA: 'main' }, { RUNTIME_SHA: 'a'.repeat(39) }, { RUNTIME_SERVER: 'https://unselected.example.invalid' }]) {
      result = run(overrides); assert.notEqual(result.status, 0, JSON.stringify({overrides,stdout:result.stdout,stderr:result.stderr,calls:readFileSync(log,"utf8")})); assert.equal(readFileSync(log, 'utf8'), '', 'invalid selection must precede any Git/network operation');
    }
    result = run({ FETCHED_SHA: 'b'.repeat(40) }); assert.notEqual(result.status, 0);
    calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(!calls.some(args => args[0] === 'checkout'), 'wrong SHA must never be checked out');
  });
}
