import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCiMeasurement } from '../dist/measurement-ci.mjs';
import { runMeasurementCli } from '../dist/measurement-cli.mjs';
import { parseWorkflow } from './helpers/workflow-structure.mjs';

function fixture(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-ci-artifact-identity-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, 'records'); mkdirSync(directory, { mode: 0o700 });
  const output = join(parent, 'github-output'); writeFileSync(output, '');
  const priorOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  t.after(() => { if (priorOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = priorOutput; });
  return { directory, output, env: { AGK_MEASUREMENT_DIR: directory, GITHUB_WORKSPACE: process.cwd(), GITHUB_OUTPUT: output,
    GITHUB_REPOSITORY: 'owner/repository', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2', PR_NUMBER: '9',
    REVIEWED_SHA: 'a'.repeat(40), RUNTIME_SHA: 'b'.repeat(40), AGK_MEASUREMENT_CHANGE_ID: 'owner/repository#9' } };
}

test('repeated review and outcome collector invocations publish distinct IDs for their exported records', t => {
  const f = fixture(t);
  const callerOutput = join(f.directory, '..', 'caller-output'); writeFileSync(callerOutput, 'untouched');
  f.env.GITHUB_OUTPUT = callerOutput;
  const invoke = command => {
    runCiMeasurement(command, f.env);
    const line = readFileSync(f.output, 'utf8').trim().split(/\r?\n/).at(-1);
    const match = /^attempt_id=([0-9a-f-]{36})$/.exec(line);
    assert.ok(match, `${command} invocation did not publish its attempt ID`);
    return match[1];
  };
  const reviewIds = [invoke('start'), invoke('start')];
  const outcomeIds = [invoke('outcome'), invoke('outcome')];
  assert.equal(readFileSync(callerOutput, 'utf8'), 'untouched', 'both routes use the original runner output sink');
  assert.equal(new Set(reviewIds).size, 2);
  assert.equal(new Set(outcomeIds).size, 2);
  assert.equal(new Set([...reviewIds, ...outcomeIds]).size, 4);

  const exported = runMeasurementCli(['export', f.directory]);
  const exportedIds = new Set(exported.records.map(record => record.attemptId));
  assert.deepEqual(exportedIds, new Set([...reviewIds, ...outcomeIds]));
  for (const id of reviewIds) {
    assert.ok(exported.records.some(record => record.attemptId === id && record.route === 'ci-review' && record.phase === 'prepared'));
  }
  for (const id of outcomeIds) {
    assert.ok(exported.records.some(record => record.attemptId === id && record.route === 'ci-outcome' && record.phase === 'terminal'));
  }
});

test('both reusable workflows name and guard each upload with its capture UUID', () => {
  for (const filename of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
    const workflow = parseWorkflow(readFileSync(new URL(`../.github/workflows/${filename}`, import.meta.url), 'utf8'));
    const reviewSteps = workflow.jobs.measurement.steps;
    const reviewUpload = reviewSteps.find(step => step.name === 'Retain optional review attempt metadata');
    assert.equal(reviewUpload.if, "always() && steps.review-measurement.outputs.review_attempt_id != ''");
    assert.equal(reviewUpload.with.name,
      'agk-measurement-review-${{ github.run_id }}-${{ github.run_attempt }}-${{ steps.review-measurement.outputs.review_attempt_id }}');
    assert.equal(reviewUpload.with['retention-days'], 30);
    assert.equal(reviewUpload.with.overwrite, false);

    const outcomeSteps = workflow.jobs.measurement.steps;
    const outcomeCollector = outcomeSteps.find(step => step.name === 'Record independent job outcomes');
    assert.equal(outcomeCollector.id, 'outcome-measurement');
    const outcomeUpload = outcomeSteps.find(step => step.name === 'Retain independent job outcome metadata');
    assert.equal(outcomeUpload.if, "always() && steps.outcome-measurement.outputs.attempt_id != ''");
    assert.equal(outcomeUpload.with.name,
      'agk-measurement-outcome-${{ github.run_id }}-${{ github.run_attempt }}-${{ steps.outcome-measurement.outputs.attempt_id }}');
    assert.equal(outcomeUpload.with['retention-days'], 30);
    assert.equal(outcomeUpload.with.overwrite, false);
  }
});

test('optional outcome job bootstrap and collection cannot fail required review, report, or accept jobs', () => {
  const optionalReviewSteps = [
    'Start optional diagnostic measurement',
    'Complete optional diagnostic measurement',
    'Export optional redacted diagnostics',
    'Retain optional review attempt metadata',
  ];
  const selectedRuntimeCondition = "needs.policy.outputs.execution_selection == 'policy' || inputs.validation-path != '' || needs.policy.outputs.legacy_validation_path != '' || needs.policy.outputs.authority_manifest_path != '' || needs.policy.outputs.policy_version == '1'";
  for (const filename of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
    const workflow = parseWorkflow(readFileSync(new URL(`../.github/workflows/${filename}`, import.meta.url), 'utf8'));
    for (const name of ['review', 'report', 'accept']) {
      assert.equal(workflow.jobs[name]['continue-on-error'], undefined, `${filename} required ${name} job must remain required`);
    }

    const measurement = workflow.jobs.measurement;
    assert.equal(measurement['continue-on-error'], true, `${filename} optional measurement job must tolerate bootstrap failure`);
    assert.equal(measurement.if, 'always() && inputs.measurement-enabled');
    assert.deepEqual(measurement.needs, ['policy', 'review', 'report', 'accept']);
    assert.deepEqual(measurement.permissions, {});
    assert.ok(measurement.steps.some(step => step.name === 'Fetch the public pinned diagnostic runtime without credentials'));
    assert.ok(!measurement.steps.some(step => step.uses?.startsWith('actions/checkout@')));
    assert.ok(measurement.steps.some(step => step.uses?.startsWith('actions/setup-node@')));
    assert.ok(measurement.steps.some(step => step.name === 'Build the pinned diagnostic runtime' && /npm ci --ignore-scripts[\s\S]*npm run build/.test(step.run)));
    const collector = measurement.steps.find(step => step.name === 'Record independent job outcomes');
    const upload = measurement.steps.find(step => step.name === 'Retain independent job outcome metadata');
    assert.equal(collector['continue-on-error'], true);
    assert.equal(upload['continue-on-error'], true);

    const review = workflow.jobs.review;
    assert.equal(
      review.if,
      filename === 'architecture-gate.yml'
        ? "(needs.policy.outputs.mode == 'enforced' || needs.policy.outputs.mode == 'procedural') && needs.policy.outputs.provider != 'gemini'"
        : "(needs.policy.outputs.mode == 'enforced' || needs.policy.outputs.mode == 'procedural')",
    );
    assert.deepEqual(review.needs, ['policy']);
    assert.equal(workflow.jobs.report.if, 'always()');
    assert.ok(workflow.jobs.report.needs.includes('review'));
    assert.equal(workflow.jobs.accept.if, 'always()');
    assert.ok(workflow.jobs.accept.needs.includes('review'));
    assert.ok(workflow.jobs.accept.needs.includes('report'));
    assert.ok(!workflow.jobs.accept.needs.includes('measurement'));
    for (const name of optionalReviewSteps) assert.ok(!review.steps.some(step => step.name === name));
    const independent = measurement.steps.find(step => step.name === 'Collect completed review metadata independently');
    assert.equal(independent['continue-on-error'], true);
    assert.equal(independent['timeout-minutes'], 1);
    assert.match(independent.run, /measurement-ci\.mjs collect/);
    assert.match(independent.run, /measurement-cli\.mjs export/);
    assert.equal(independent.env.REVIEW_RESULT, '${{ needs.review.result }}');
    assert.equal(independent.env.REVIEW_DECISION_KIND, '${{ needs.review.outputs.decision_kind }}');
    assert.equal(independent.env.REVIEW_PUBLISHED_DECISION, '${{ needs.review.outputs.final_message }}');
    assert.equal(independent.env.REVIEW_JOB_NAME, '${{ inputs.measurement-review-job-name }}');
    const reviewUpload = measurement.steps.find(step => step.name === 'Retain optional review attempt metadata');
    assert.equal(reviewUpload['continue-on-error'], true);
    for (const name of ['review', 'report', 'accept']) assert.ok(!workflow.jobs[name].needs.includes('measurement'));
    for (const name of ['Check out the pinned validation runtime', 'Relocate pinned validation runtime', 'Build the pinned validation runtime']) {
      const step = review.steps.find(candidate => candidate.name === name);
      assert.equal(step.if, selectedRuntimeCondition, `${filename} ${name} must retain the protected validator selection predicate`);
      assert.equal(step['continue-on-error'], undefined, `${filename} ${name} must retain its protected failure behavior`);
    }
  }
});
