import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadMeasurementDirectory } from '../dist/measurement.mjs';
import { runCiMeasurement } from '../dist/measurement-ci.mjs';
import { parseWorkflow } from './helpers/workflow-structure.mjs';

const validDecision = { decision: 'PASS', summary: 'ok', authorityFiles: ['AGENTS.md'], reviewedScope: ['scope'], findings: [] };

function fixture(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-ci-measurement-outcomes-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, 'records'); mkdirSync(directory, { mode: 0o700 });
  const output = join(parent, 'github-output'); writeFileSync(output, '');
  const priorOutput = process.env.GITHUB_OUTPUT; process.env.GITHUB_OUTPUT = output;
  t.after(() => { if (priorOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = priorOutput; });
  const decisionPath = join(parent, 'decision.json');
  const env = { AGK_MEASUREMENT_DIR: directory, GITHUB_WORKSPACE: process.cwd(), GITHUB_OUTPUT: output,
    GITHUB_RUN_ID: '31', GITHUB_RUN_ATTEMPT: '2', REVIEW_OUTCOME: 'success',
    EXECUTION_OBSERVATION_SELECTED: 'false', EXECUTION_OBSERVATION_OUTCOME: 'skipped',
    DECISION_KIND_SELECTED: 'true', DECISION_KIND_OUTCOME: 'success',
    CONSUMER_VALIDATION_SELECTED: 'true', CONSUMER_VALIDATION: 'success',
    LEGACY_VALIDATION_SELECTED: 'false', LEGACY_VALIDATION: 'skipped',
    AUTHORITY_VALIDATION_SELECTED: 'false', AUTHORITY_VALIDATION: 'skipped',
    REVIEW_OUTPUT_FILE: decisionPath, REVIEW_RESPONSE: JSON.stringify(validDecision) };
  return { parent, directory, output, decisionPath, env };
}

function finishAttempt(f) {
  writeFileSync(f.output, '');
  runCiMeasurement('start', f.env);
  const attemptId = readFileSync(f.output, 'utf8').trim().split('=')[1];
  f.env.MEASUREMENT_ATTEMPT_ID = attemptId;
  runCiMeasurement('finish', f.env);
  return loadMeasurementDirectory(f.directory).records.find(record => record.attemptId === attemptId && record.phase === 'terminal');
}

test('CI collector requires successful selected steps and skipped unselected steps', t => {
  const f = fixture(t);
  writeFileSync(f.decisionPath, JSON.stringify(validDecision));
  const baseline = { ...f.env };
  const completed = finishAttempt(f);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.decision.decision, 'PASS');

  // The real decision-kind reader has a 65,536-byte ceiling. The collector
  // accepts larger files, so the workflow can skip later validators on this
  // failure unless it binds their selected status and outcome explicitly.
  const oversized = { ...validDecision, summary: 'x'.repeat(65_537) };
  const serialized = JSON.stringify(oversized);
  assert.ok(Buffer.byteLength(serialized) > 65_536 && Buffer.byteLength(serialized) < 256 * 1024);
  const decisionKind = spawnSync(process.execPath, [realpathSync(new URL('../dist/ci-decision-kind.mjs', import.meta.url))], {
    env: { ...process.env, DECISION: serialized, GITHUB_OUTPUT: f.output }, encoding: 'utf8' });
  assert.notEqual(decisionKind.status, 0);
  assert.match(decisionKind.stderr, /oversized/);
  writeFileSync(f.decisionPath, serialized);
  f.env = { ...baseline, REVIEW_RESPONSE: serialized, DECISION_KIND_OUTCOME: 'failure', CONSUMER_VALIDATION: 'skipped',
    AUTHORITY_VALIDATION_SELECTED: 'true', AUTHORITY_VALIDATION: 'skipped' };
  const failed = finishAttempt(f);
  assert.equal(failed.state, 'incomplete');
  assert.equal(failed.decision, null);
  assert.equal(failed.observation.decisionKindOutcome, 'failure');
  assert.equal(failed.observation.validation, 'incomplete');

  // A bounded valid response exercises validator outcomes independently of the
  // decision-kind parser's size rejection.
  const valid = JSON.stringify(validDecision);
  writeFileSync(f.decisionPath, valid);
  f.env = { ...baseline };
  assert.equal(finishAttempt(f).state, 'completed', 'restored baseline completes before negative matrix');
  const requiredSteps = [
    ['execution-observation', 'EXECUTION_OBSERVATION_SELECTED', 'EXECUTION_OBSERVATION_OUTCOME'],
    ['decision-kind', 'DECISION_KIND_SELECTED', 'DECISION_KIND_OUTCOME'],
    ['consumer', 'CONSUMER_VALIDATION_SELECTED', 'CONSUMER_VALIDATION'],
    ['legacy', 'LEGACY_VALIDATION_SELECTED', 'LEGACY_VALIDATION'],
    ['authority', 'AUTHORITY_VALIDATION_SELECTED', 'AUTHORITY_VALIDATION'],
  ];
  const goodOutcome = {
    EXECUTION_OBSERVATION_OUTCOME: 'skipped',
    DECISION_KIND_OUTCOME: 'success', CONSUMER_VALIDATION: 'success',
    LEGACY_VALIDATION: 'skipped', AUTHORITY_VALIDATION: 'skipped',
  };
  for (const [label, selectionKey, outcomeKey] of requiredSteps) {
    f.env = { ...baseline, ...goodOutcome, REVIEW_RESPONSE: valid, [selectionKey]: 'true', [outcomeKey]: 'success' };
    assert.equal(finishAttempt(f).state, 'completed', `selected ${label} success completes`);
    for (const outcome of ['skipped', 'failure', 'cancelled', 'unknown', undefined]) {
      const selections = { ...baseline, [selectionKey]: 'true' };
      const outcomes = { ...goodOutcome, [outcomeKey]: outcome };
      f.env = { ...selections, ...outcomes, REVIEW_RESPONSE: valid };
      const terminal = finishAttempt(f);
      assert.equal(terminal.state, 'incomplete', `selected ${label} outcome ${outcome}`);
      assert.equal(terminal.decision, null);
    }

    // The selection binding must also be present and coherent for each step.
    f.env = { ...baseline, ...goodOutcome, REVIEW_RESPONSE: valid };
    delete f.env[selectionKey];
    assert.equal(finishAttempt(f).state, 'incomplete', `missing ${label} selection`);
    f.env = { ...baseline, ...goodOutcome, REVIEW_RESPONSE: valid, [selectionKey]: 'false' };
    delete f.env[outcomeKey];
    assert.equal(finishAttempt(f).state, 'incomplete', `missing unselected ${label} outcome`);
    f.env = { ...baseline, ...goodOutcome, REVIEW_RESPONSE: valid, [selectionKey]: 'false', [outcomeKey]: 'success' };
    assert.equal(finishAttempt(f).state, 'incomplete', `unselected ${label} did not skip`);
  }
});

test('both workflows keep validation inside required review and publish only completed metadata to diagnostics', () => {
  for (const filename of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
    const workflow = parseWorkflow(readFileSync(new URL(`../.github/workflows/${filename}`, import.meta.url), 'utf8'));
    const collector = workflow.jobs.measurement.steps.find(step => step.id === 'review-measurement');
    assert.equal(collector.env.REVIEW_RESULT, '${{ needs.review.result }}');
    assert.equal(collector.env.REVIEW_DECISION_KIND, '${{ needs.review.outputs.decision_kind }}');
    for (const key of ['REVIEW_RESPONSE', 'REVIEW_OUTPUT_FILE', 'PROMPT_PATH', 'SCHEMA_PATH', 'REVIEW_MODEL', 'REVIEW_EFFORT']) assert.equal(collector.env[key], undefined);
    for (const name of ['Record ordinary execution observation', 'Identify the completed ordinary decision', 'Apply consumer-owned decision validation', 'Require exact reported legacy authority files', 'Require exact reported Authority IDs']) {
      const step = workflow.jobs.review.steps.find(s => s.name === name); assert.ok(step); assert.equal(step['continue-on-error'], undefined);
    }
  }
});

test('policy-owned execution observation failure stays incomplete even when every validator is unselected', t => {
  const f = fixture(t);
  writeFileSync(f.decisionPath, JSON.stringify(validDecision));
  Object.assign(f.env, { EXECUTION_OBSERVATION_SELECTED: 'true',
    DECISION_KIND_SELECTED: 'false', DECISION_KIND_OUTCOME: 'skipped',
    CONSUMER_VALIDATION_SELECTED: 'false', CONSUMER_VALIDATION: 'skipped' });
  for (const outcome of ['failure', 'skipped', 'cancelled', undefined]) {
    f.env.EXECUTION_OBSERVATION_OUTCOME = outcome;
    const terminal = finishAttempt(f);
    assert.equal(terminal.state, 'incomplete');
    assert.equal(terminal.decision, null);
    assert.equal(terminal.observation.validationSelection.executionObservation, 'true');
    assert.equal(terminal.observation.validationOutcomes.executionObservation, outcome || 'unknown');
  }
  f.env.EXECUTION_OBSERVATION_OUTCOME = 'success';
  assert.equal(finishAttempt(f).state, 'completed');
});


test('completion covers every combination of selected stages, with failures isolated to each selected stage', t => {
  const f = fixture(t); writeFileSync(f.decisionPath, JSON.stringify(validDecision));
  const stages = [['EXECUTION_OBSERVATION_SELECTED', 'EXECUTION_OBSERVATION_OUTCOME'], ['DECISION_KIND_SELECTED', 'DECISION_KIND_OUTCOME'],
    ['CONSUMER_VALIDATION_SELECTED', 'CONSUMER_VALIDATION'], ['LEGACY_VALIDATION_SELECTED', 'LEGACY_VALIDATION'],
    ['AUTHORITY_VALIDATION_SELECTED', 'AUTHORITY_VALIDATION']];
  const baseline = { ...f.env };
  for (let mask = 0; mask < 32; mask++) {
    const selection = { ...baseline };
    stages.forEach(([flag, outcome], index) => { const selected = Boolean(mask & (1 << index)); selection[flag] = String(selected); selection[outcome] = selected ? 'success' : 'skipped'; });
    f.env = { ...selection };
    assert.equal(finishAttempt(f).state, 'completed', `selection mask ${mask}`);
    for (const [flag, outcome] of stages.filter(([flag]) => selection[flag] === 'true')) {
      f.env = { ...selection, [outcome]: 'failure' };
      assert.equal(finishAttempt(f).state, 'incomplete', `selection mask ${mask}, failed ${flag}`);
    }
    for (const outcome of ['failure', 'skipped', undefined]) {
      f.env = { ...selection, REVIEW_OUTCOME: outcome };
      assert.equal(finishAttempt(f).state, 'incomplete', `selection mask ${mask}, failed review ${outcome}`);
    }
    f.env = { ...selection, REVIEW_OUTCOME: 'cancelled' };
    assert.equal(finishAttempt(f).state, 'cancelled', `cancelled selection mask ${mask}`);
  }
});

test('all required post-model stages retain validation and reporting order with no diagnostic waits', () => {
  for (const filename of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
    const steps = parseWorkflow(readFileSync(new URL(`../.github/workflows/${filename}`, import.meta.url), 'utf8')).jobs.review.steps;
    const codex = steps.findIndex(step => step.id === 'codex');
    assert.deepEqual(steps.slice(codex + 1).filter(step => step['continue-on-error'] !== true).map(step => step.id),
      ['execution', 'decision', undefined, undefined, undefined, ...(filename === 'architecture-gate.yml' ? ['pass-display'] : [])]);
    assert.ok(!steps.some(step => /measurement-(?:ci|cli)\.mjs/.test(step.run || '')));
  }
});

test('CI diagnostic bootstrap refuses in-worktree directories before creating them', t => {
  const f = fixture(t);
  const workspace = join(f.directory, 'workspace'); mkdirSync(workspace);
  for (const command of ['start', 'outcome', 'finish']) {
    const target = join(workspace, `records-${command}`);
    assert.equal(existsSync(target), false);
    assert.throws(() => runCiMeasurement(command, { ...f.env, GITHUB_WORKSPACE: workspace, AGK_MEASUREMENT_DIR: target }), /outside the reviewed worktree/);
    assert.equal(existsSync(target), false);
  }
});


test('real CI CLI resumes from runner temp against the reviewed workspace', t => {
  const f = fixture(t);
  const workspace = join(f.parent, 'workspace'); mkdirSync(workspace);
  writeFileSync(f.decisionPath, JSON.stringify(validDecision));
  const cli = realpathSync(new URL('../dist/measurement-ci.mjs', import.meta.url));
  for (const [outcome, state] of [['success', 'completed'], ['failure', 'incomplete'], ['cancelled', 'cancelled']]) {
    writeFileSync(f.output, '');
    const env = { ...process.env, ...f.env, GITHUB_WORKSPACE: workspace, REVIEW_OUTCOME: outcome };
    let run = spawnSync(process.execPath, [cli, 'start'], { cwd: f.parent, env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const attemptId = readFileSync(f.output, 'utf8').trim().split('=')[1]; assert.ok(attemptId);
    run = spawnSync(process.execPath, [cli, 'finish'], { cwd: f.parent, env: { ...env, MEASUREMENT_ATTEMPT_ID: attemptId }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr); assert.equal(run.stderr, '');
    const terminal = loadMeasurementDirectory(f.directory).records.find(r => r.attemptId === attemptId && r.phase === 'terminal');
    assert.ok(terminal, 'finish writes a terminal under runner temp'); assert.equal(terminal.state, state);
    assert.equal(terminal.decision?.decision ?? null, state === 'completed' ? 'PASS' : null);
  }
});


test('CI bootstrap resolves nested workspace to its Git root before creating diagnostic directories', t => {
  const f = fixture(t);
  const workspace = join(f.parent, 'checkout'); mkdirSync(workspace);
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  const subdir = join(workspace, 'src'); mkdirSync(subdir);
  for (const command of ['start', 'outcome', 'finish']) {
    const target = join(workspace, `private-${command}`);
    assert.throws(() => runCiMeasurement(command, { ...f.env, GITHUB_WORKSPACE: subdir, AGK_MEASUREMENT_DIR: target }), /outside the reviewed worktree/);
    assert.equal(existsSync(target), false);
  }
});
