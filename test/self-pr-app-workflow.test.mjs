import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const selfPath = new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url);
const calledPath = new URL('../.github/workflows/architecture-gate.yml', import.meta.url);
const completenessPath = new URL('../.github/workflows/pr-description.yml', import.meta.url);
const queuePath = new URL('../.github/workflows/self-queue-acceptance.yml', import.meta.url);
const parseWorkflow = path => parse(readFileSync(path, 'utf8'));

test('self App workflow projection resolves only declared protected outputs', () => {
  const caller = parseWorkflow(selfPath);
  const called = parseWorkflow(calledPath);
  const jobs = called.jobs;
  const outputNames = new Set(Object.keys(called.on.workflow_call.outputs));
  for (const [, value] of Object.entries(caller.jobs['self-app-report'].steps.at(-1).env)) {
    for (const match of String(value).matchAll(/needs\.architecture-gate\.outputs\.([A-Za-z0-9_]+)/g)) {
      assert.ok(outputNames.has(match[1]), `caller references undeclared reusable output ${match[1]}`);
    }
  }
  const producers = {
    review_workflow_repository: "${{ jobs.policy.outputs.self_app_workflow_repository }}",
    review_workflow_sha: "${{ jobs.policy.outputs.self_app_workflow_sha }}",
    review_workflow_ref: "${{ jobs.policy.outputs.self_app_workflow_ref }}",
    policy_result: '${{ jobs.policy.result }}', mode: '${{ jobs.policy.outputs.mode }}',
    policy_sha256: '${{ jobs.policy.outputs.policy_sha256 }}', review_result: '${{ jobs.review.result }}',
    decision_base64: '${{ jobs.review.outputs.self_app_decision_base64 }}',
    reviewed_sha: '${{ jobs.review.outputs.reviewed_sha }}',
    authority_provenance_base64: '${{ jobs.review.outputs.authority_provenance }}',
    selected_authority_changed: '${{ jobs.review.outputs.self_authority_changed }}',
    amendment_signer_result: "${{ jobs['owner-amendment-semantic-eligibility-signer'].result }}",
    amendment_signer_status: "${{ jobs['owner-amendment-semantic-eligibility-signer'].outputs.status }}",
    amendment_eligibility: "${{ jobs['owner-amendment-semantic-eligibility-signer'].outputs.eligibility }}",
    amendment_artifact_id: "${{ jobs['owner-amendment-semantic-eligibility-signer'].outputs.artifact_id }}",
    amendment_artifact_digest: "${{ jobs['owner-amendment-semantic-eligibility-signer'].outputs.artifact_digest }}",
    amendment_completed_at: "${{ jobs['owner-amendment-semantic-eligibility-signer'].outputs.completed_at }}",
  };
  for (const [name, expected] of Object.entries(producers)) {
    assert.equal(called.on.workflow_call.outputs[name].value, expected, `${name} producer mapping`);
  }
  for (const [job, step] of [['policy', 'self-app-source'], ['review', 'self-app-projection']]) {
    const outputs = jobs[job].outputs;
    for (const expression of Object.values(outputs)) {
      const match = String(expression).match(/^\$\{\{ steps\.([^.]+)\.outputs\.([^.}]+) \}\}$/);
      if (match) assert.ok(jobs[job].steps.some(candidate => candidate.id === match[1]), `${job}.${match[2]} producer step exists`);
    }
    assert.ok(jobs[job].steps.some(candidate => candidate.id === step));
  }
  const projected = jobs.review.steps.find(step => step.id === 'self-app-projection');
  assert.ok(projected, 'review emits bounded decision projection');
  assert.match(projected.if, /inputs\.self-app-projection/);
  assert.match(projected.if, /github\.repository == 'flair-agency\/architecture-gatekeeper'/);
  assert.match(projected.if, /github\.event_name == 'pull_request_target'/);
  assert.match(projected.if, /github\.event\.pull_request\.base\.ref == 'main'/);
});

test('dedicated App credentials and pending-check lifecycle stay in protected start/report jobs', () => {
  const caller = parseWorkflow(selfPath);
  const jobs = caller.jobs;
  assert.equal(jobs['self-app-start'].if.includes("vars.ARCHITECTURE_GATE_SELF_APP_ENABLED == 'true'"), true);
  assert.equal(jobs['self-app-report'].if.includes("vars.ARCHITECTURE_GATE_SELF_APP_ENABLED == 'true'"), true);
  assert.deepEqual(jobs['self-app-report'].needs, ['classify-self-repository', 'self-app-start', 'architecture-gate']);
  assert.deepEqual(jobs['architecture-gate'].needs, ['classify-self-repository', 'self-app-start']);
  for (const jobName of ['self-app-start', 'self-app-report']) {
    const job = jobs[jobName];
    const steps = job.steps;
    assert.equal(job.environment, 'architecture-gate-self-app-report');
    assert.ok(steps.some(step => String(step.run || '').includes('self-pr-app-report.mjs') && String(step.run).includes(jobName === 'self-app-start' ? ' begin' : ' report')));
    assert.ok(Object.hasOwn(steps.find(step => step.run)?.env || {}, 'AGK_APP_PRIVATE_KEY') || steps.some(step => Object.hasOwn(step.env || {}, 'AGK_APP_PRIVATE_KEY')));
    assert.ok(steps.every(step => !String(step.run || '').includes('actions/github-script')));
  }
  assert.match(jobs['architecture-gate'].if, /needs\.self-app-start\.result == 'success'/);
  assert.match(jobs['deny-unreviewed-fork'].if, /classification != 'same-repository'/);
  assert.match(jobs['deny-unreviewed-fork'].steps.at(-1).run, /exit 1/);
});

test('PR metadata edits rerun the metadata-only completeness workflow while Queue validates completeness at final N', () => {
  const self = parseWorkflow(selfPath);
  const completeness = parseWorkflow(completenessPath);
  const queue = parseWorkflow(queuePath);
  assert.ok(completeness.on.pull_request_target.types.includes('edited'));
  assert.ok(!self.on.pull_request_target.types.includes('edited'));
  const appReport = readFileSync(new URL('../scripts/self-pr-app-report.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(appReport, /pr-description-completeness|validateQueuedPrDescription|pull_request\.body/);
  const queueCompleteness = queue.jobs['report-completeness'].steps.find(step => String(step.run || '').includes('self-queue-completeness.mjs'));
  assert.ok(queueCompleteness, 'Queue report still performs its own exact-Queue completeness validation');
  assert.match(String(queueCompleteness.if), /route == 'ordinary'.*route == 'amendment'/);
});
