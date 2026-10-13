import test from 'node:test';

import assert from 'node:assert/strict';

import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { execFileSync, spawnSync } from 'node:child_process';

import { beginMeasurement, loadMeasurementDirectory, redactMeasurement, readMeasurementJson, validateMeasurementRecord, measurementDigest } from '../dist/measurement.mjs';

import { runCiMeasurement } from '../dist/measurement-ci.mjs';

import { readDiagnosticText, resolveDiagnosticPath } from '../dist/diagnostic-path.mjs';

import { parseWorkflow } from './helpers/workflow-structure.mjs';

function fixture(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-measurement-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo'); const dir = join(parent, 'records');
  const priorOutput = process.env.GITHUB_OUTPUT;
  const output = join(parent, 'output'); writeFileSync(output, ''); process.env.GITHUB_OUTPUT = output;
  t.after(() => { if (priorOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = priorOutput; });
  mkdirSync(join(root, '.codex/gatekeeper'), { recursive: true }); mkdirSync(dir, { mode: 0o700 });
  const files = { 'AGENTS.md': '# Authority', 'candidate.md': 'initial', '.codex/gatekeeper/prompt.md': 'review', '.codex/gatekeeper/schema.json': '{"type":"object"}',
    '.codex/gatekeeper/reviewer.json': '{"model":"fixture","reasoningEffort":"low"}',
    '.codex/gatekeeper/config.json': JSON.stringify({ version: 1, authorityFiles: ['AGENTS.md'], requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'], promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000 }) };
  for (const [name, value] of Object.entries(files)) writeFileSync(join(root, name), value);
  for (const args of [['init'], ['config','user.name','Test'], ['config','user.email','test@example.invalid'], ['config','commit.gpgSign','false'], ['add','.'], ['commit','-m','fixture']]) execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  return { parent, root, dir, measurement: { directory: dir, changeId: 'change-1' } };
}

const pass = { decision: 'PASS', summary: 'private summary', authorityFiles: ['AGENTS.md'], reviewedScope: ['private scope'], findings: [] };

const block = { ...pass, decision: 'BLOCK', findings: [{ title: 'private finding', details: 'secret details' }] };

test('diagnostic paths reject traversal, sibling prefixes and injected CI roots before access', t => {
  const { root, dir } = fixture(t);
  for (const path of ['/etc/agk-not-created', '/tmp/../../etc/agk-not-created', '/tmp-sibling/agk-not-created']) {
    assert.throws(() => resolveDiagnosticPath(path), /outside host/);
    assert.throws(() => runCiMeasurement('start', { AGK_MEASUREMENT_DIR: path, GITHUB_WORKSPACE: '/etc', RUNNER_TEMP: '/etc' }), /outside host/);
    assert.equal(existsSync(path), false);
  }
  assert.equal(resolveDiagnosticPath('./package.json'), new URL('../package.json', import.meta.url).pathname);
  assert.equal(beginMeasurement({ route: 'manual', cwd: root, directory: dir }).id !== null, true);
});

test('CI collector separates validation, semantic outcome and acceptance; artifact is redacted', t => {
  const { root, parent, dir } = fixture(t); const output = join(parent, 'output');
  const env = { AGK_MEASUREMENT_DIR: dir, AGK_MEASUREMENT_CHANGE_ID: 'repo#1', GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output,
    GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '2', PR_NUMBER: '3', REVIEWED_SHA: 'a'.repeat(40),
    PROMPT_PATH: join(root, '.codex/gatekeeper/prompt.md'), SCHEMA_PATH: join(root, '.codex/gatekeeper/schema.json') };
  runCiMeasurement('start', env); env.MEASUREMENT_ATTEMPT_ID = readFileSync(output, 'utf8').trim().split('=')[1];
  const decision = join(parent, 'decision'); writeFileSync(decision, JSON.stringify(block));
  Object.assign(env, { REVIEW_OUTCOME: 'success', EXECUTION_OBSERVATION_SELECTED: 'false', EXECUTION_OBSERVATION_OUTCOME: 'skipped', DECISION_KIND_SELECTED: 'true', DECISION_KIND_OUTCOME: 'success',
    CONSUMER_VALIDATION_SELECTED: 'true', CONSUMER_VALIDATION: 'success', LEGACY_VALIDATION_SELECTED: 'false', LEGACY_VALIDATION: 'skipped',
    AUTHORITY_VALIDATION_SELECTED: 'true', AUTHORITY_VALIDATION: 'success', REVIEW_OUTPUT_FILE: decision, REVIEW_RESPONSE: JSON.stringify(block) });
  runCiMeasurement('finish', env); runCiMeasurement('outcome', { ...env, REVIEW_RESULT: 'success', REPORT_RESULT: 'failure', ACCEPT_RESULT: 'failure', POLICY_RESULT: 'success' });
  const data = loadMeasurementDirectory(dir); const review = data.records.find(r => r.route === 'ci-review' && r.phase === 'terminal');
  assert.equal(review.decision.decision, 'BLOCK'); assert.equal(redactMeasurement(review).ci.runAttempt, '2');
  assert.ok(!JSON.stringify(data.records.map(redactMeasurement)).includes('secret'));
  assert.equal(data.records.find(r => r.route === 'ci-outcome' && r.phase === 'terminal').observation.acceptJob, 'failure');
});

test('CI measurement is default-off and never a prerequisite for acceptance; no private artifact upload', () => {
  for (const file of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
    const w = parseWorkflow(readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8'));
    assert.equal(w.on.workflow_call.inputs['measurement-enabled'].default, false);
    assert.ok(!w.jobs.accept.needs.includes('measurement')); assert.deepEqual(w.jobs.measurement.needs, ['policy','review','report','accept']);
    assert.deepEqual(w.jobs.measurement.permissions, {});
    const steps = w.jobs.review.steps;
    assert.ok(!steps.some(s => /measurement-(?:ci|cli)\.mjs/.test(s.run || '')));
    const collector = w.jobs.measurement.steps.find(s => s.id === 'review-measurement'); assert.equal(collector['continue-on-error'], true); assert.equal(collector['timeout-minutes'], 1);
    for (const j of [w.jobs.review, w.jobs.measurement]) for (const s of j.steps.filter(s => s.uses?.startsWith('actions/upload-artifact'))) {
      if (s.with.name.startsWith('agk-measurement')) { assert.match(s.with.path, /-export\.json$/); assert.equal(s.with['retention-days'], 30); assert.equal(s.with.overwrite, false); }
    }
  }
});

test('diagnostic selection preserves required runtime bootstrap conditions and failure behavior', () => {
  const requiredBootstrap = "needs.policy.outputs.execution_selection == 'policy' || inputs.validation-path != '' || needs.policy.outputs.legacy_validation_path != '' || needs.policy.outputs.authority_manifest_path != '' || needs.policy.outputs.policy_version == '1'";
  for (const file of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
    const w = parseWorkflow(readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8'));
    for (const name of ['Check out the pinned validation runtime', 'Relocate pinned validation runtime', 'Build the pinned validation runtime']) {
      const step = w.jobs.review.steps.find(s => s.name === name);
      assert.equal(step.if, requiredBootstrap);
      assert.equal(step['continue-on-error'], undefined);
    }
    assert.ok(!w.jobs.review.steps.some(s => s.id === 'measurement-start'));
    assert.equal(w.jobs.measurement.if, 'always() && inputs.measurement-enabled');
    assert.equal(w.jobs.measurement['continue-on-error'], true);
  }
});

test('CI capture rejects a decision file that differs from the validated action output', t => {
  const { root, parent, dir } = fixture(t); const output = join(parent, 'output'); const file = join(parent, 'decision.json'); writeFileSync(file, JSON.stringify(block));
  const env = { AGK_MEASUREMENT_DIR: dir, GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output, GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
    REVIEW_OUTCOME: 'success', EXECUTION_OBSERVATION_SELECTED: 'false', EXECUTION_OBSERVATION_OUTCOME: 'skipped', DECISION_KIND_SELECTED: 'true', DECISION_KIND_OUTCOME: 'success',
    CONSUMER_VALIDATION_SELECTED: 'true', CONSUMER_VALIDATION: 'success', LEGACY_VALIDATION_SELECTED: 'false', LEGACY_VALIDATION: 'skipped',
    AUTHORITY_VALIDATION_SELECTED: 'true', AUTHORITY_VALIDATION: 'success', REVIEW_OUTPUT_FILE: file,
    REVIEW_RESPONSE: JSON.stringify(pass) };
  runCiMeasurement('start', env); env.MEASUREMENT_ATTEMPT_ID = readFileSync(output, 'utf8').trim().split('=')[1]; runCiMeasurement('finish', env);
  const terminal = loadMeasurementDirectory(dir).records.find(r => r.phase === 'terminal');
  assert.equal(terminal.state, 'incomplete'); assert.equal(terminal.decision, null);
  assert.equal(terminal.observation.collection, 'missing-decision');
});

test('CI capture leaves missing and malformed validated responses incomplete', t => {
  const { root, parent, dir } = fixture(t); const output = join(parent, 'output'); const file = join(parent, 'decision.json'); writeFileSync(file, JSON.stringify(block));
  for (const response of [JSON.stringify(block), undefined, '{bad', '{"decision":"PASS","decision":"BLOCK"}', ' '.repeat(256 * 1024 + 1)]) {
    writeFileSync(output, '');
    const env = { AGK_MEASUREMENT_DIR: dir, GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output, GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1',
      REVIEW_OUTCOME: 'success', EXECUTION_OBSERVATION_SELECTED: 'false', EXECUTION_OBSERVATION_OUTCOME: 'skipped', DECISION_KIND_SELECTED: 'true', DECISION_KIND_OUTCOME: 'success',
      CONSUMER_VALIDATION_SELECTED: 'true', CONSUMER_VALIDATION: 'success', LEGACY_VALIDATION_SELECTED: 'false', LEGACY_VALIDATION: 'skipped',
      AUTHORITY_VALIDATION_SELECTED: 'true', AUTHORITY_VALIDATION: 'success', REVIEW_OUTPUT_FILE: file, REVIEW_RESPONSE: response };
    runCiMeasurement('start', env); env.MEASUREMENT_ATTEMPT_ID = readFileSync(output, 'utf8').trim().split('=')[1]; runCiMeasurement('finish', env);
    const terminal = loadMeasurementDirectory(dir).records.find(r => r.phase === 'terminal' && r.attemptId === env.MEASUREMENT_ATTEMPT_ID);
    assert.equal(terminal.observation.validation, 'selected-checks-completed');
    if (response === JSON.stringify(block)) {
      assert.equal(terminal.state, 'completed'); assert.deepEqual(terminal.decision, block);
      assert.equal(terminal.observation.collection, 'observed');
    } else {
      assert.equal(terminal.state, 'incomplete'); assert.equal(terminal.decision, null);
      assert.equal(terminal.observation.collection, 'missing-decision');
    }
  }
});

test('CI attempt publication uses only the checked runner sink, ignoring caller output selection', t => {
  const { root, parent, dir } = fixture(t); const forged = join(parent, 'forged-output'); writeFileSync(forged, 'untouched');
  runCiMeasurement('start', { AGK_MEASUREMENT_DIR: dir, GITHUB_WORKSPACE: root, GITHUB_OUTPUT: forged, GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' });
  const output = join(parent, 'output');
  assert.equal(readFileSync(forged, 'utf8'), 'untouched'); assert.match(readFileSync(output, 'utf8'), /^attempt_id=/);
  const sink = process.env.GITHUB_OUTPUT; const linked = join(parent, 'linked-output'); symlinkSync(forged, linked); process.env.GITHUB_OUTPUT = linked;
  assert.throws(() => runCiMeasurement('start', { AGK_MEASUREMENT_DIR: dir, GITHUB_WORKSPACE: root }), /direct regular file/);
  assert.equal(readFileSync(forged, 'utf8'), 'untouched'); process.env.GITHUB_OUTPUT = sink;
});

test('an injected workspace cannot widen the host diagnostic root boundary',t=>{
 const {dir}=fixture(t);
 assert.throws(()=>runCiMeasurement('outcome',{AGK_MEASUREMENT_DIR:dir,GITHUB_WORKSPACE:'/etc'}),/outside host/);
 assert.deepEqual(readdirSync(dir),[]);
});
