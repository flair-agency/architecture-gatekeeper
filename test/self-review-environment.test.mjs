import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const selfWorkflow = await readFile(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
const reusableWorkflow = await readFile(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');

test('self Environment migration remains opt-in and suppresses the legacy secret when selected', () => {
  assert.match(selfWorkflow, /ARCHITECTURE_GATE_SELF_REVIEW_ENVIRONMENT == 'true'/);
  assert.match(selfWorkflow, /ARCHITECTURE_GATE_SELF_REVIEW_ENVIRONMENT != 'true' && secrets\.OPENAI_API_KEY \|\| ''/);
  assert.match(selfWorkflow, /self-review-environment:.*ARCHITECTURE_GATE_SELF_REVIEW_ENVIRONMENT == 'true'/);
});

test('Environment selection is fixed to protected self main workflow context before credential jobs', () => {
  assert.match(reusableWorkflow, /self-review-environment:[\s\S]*?default: false/);
  const guard = reusableWorkflow.indexOf('Validate opt-in self-review Environment selection');
  const jobs = [...reusableWorkflow.matchAll(/^  ([a-z][a-z-]*):\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|$(?![\s\S]))/gm)];
  const credentialJobs = jobs.filter(([, , body]) => body.includes('secrets.OPENAI_API_KEY'));
  assert.ok(guard > 0);
  assert.deepEqual(credentialJobs.map(([, name]) => name), [
    'review', 'owner-addition', 'owner-amendment-semantic-eligibility',
  ]);
  for (const [, name, job] of credentialJobs) {
    assert.match(job, /needs:.*policy/, `${name} must wait for the self selection guard`);
    assert.match(job, /environment:.*architecture-gate-self-protected/, `${name} must use the fixed Environment on opt-in`);
  }
  assert.match(reusableWorkflow, /test "\$REPOSITORY" = flair-agency\/architecture-gatekeeper/);
  assert.match(reusableWorkflow, /test "\$EVENT_NAME" = pull_request_target/);
  assert.match(reusableWorkflow, /test "\$WORKFLOW_REF" = flair-agency\/architecture-gatekeeper\/\.github\/workflows\/self-architecture-gate\.yml@refs\/heads\/main/);
  assert.match(reusableWorkflow, /test "\$BASE_REF" = main/);
});

test('opt-in guard accepts only self main context and leaves generic callers on the default route', async () => {
  const step = reusableWorkflow.match(/- name: Validate opt-in self-review Environment selection\n[\s\S]*?\n        run: \|\n((?:          .*\n)+)/)?.[1];
  assert.ok(step, 'guard run block must be present');
  const script = step.split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const directory = await mkdtemp(join(tmpdir(), 'agk-self-environment-'));
  try {
    const run = async ({ selected = 'false', repository = 'any/consumer', event = 'pull_request', ref = 'any/workflow.yml@refs/heads/main', base = 'main' } = {}) => {
      const output = join(directory, 'output');
      await writeFile(output, '');
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
        encoding: 'utf8',
        env: { ...process.env, SELECTED: selected, REPOSITORY: repository, EVENT_NAME: event,
          WORKFLOW_REF: ref, BASE_REF: base, GITHUB_OUTPUT: output },
      });
      return { ...result, output };
    };
    const generic = await run();
    assert.equal(generic.status, 0, generic.stderr);
    assert.equal(await readFile(generic.output, 'utf8'), 'selected=false\n');
    const self = await run({ selected: 'true', repository: 'flair-agency/architecture-gatekeeper',
      event: 'pull_request_target',
      ref: 'flair-agency/architecture-gatekeeper/.github/workflows/self-architecture-gate.yml@refs/heads/main' });
    assert.equal(self.status, 0, self.stderr);
    assert.equal(await readFile(self.output, 'utf8'), 'selected=true\n');
    for (const change of [
      { repository: 'attacker/repository' },
      { event: 'pull_request' },
      { ref: 'flair-agency/architecture-gatekeeper/.github/workflows/self-architecture-gate.yml@refs/heads/feature' },
      { base: 'release' },
    ]) {
      const rejected = await run({ selected: 'true', repository: 'flair-agency/architecture-gatekeeper',
        event: 'pull_request_target',
        ref: 'flair-agency/architecture-gatekeeper/.github/workflows/self-architecture-gate.yml@refs/heads/main',
        ...change });
      assert.notEqual(rejected.status, 0, JSON.stringify(change));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
