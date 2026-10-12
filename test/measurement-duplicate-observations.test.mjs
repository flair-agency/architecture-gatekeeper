import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregateMeasurement, sampleMeasurementPopulation, validateMeasurementDataset } from '../dist/measurement-analysis.mjs';
import { measurementDigest, redactMeasurement } from '../dist/measurement.mjs';
import { runMeasurementCli } from '../dist/measurement-cli.mjs';

const attemptId = '12345678-1234-4123-8123-123456789abc';
function records() {
  const common = { version: 1, kind: 'agk-diagnostic', attemptId, route: 'manual', startedAt: '2026-01-01T00:00:00.000Z',
    changeId: 'change-1', repositoryId: null, sessionId: null, correlation: null, runtime: { package: 'fixture', flags: ['first', 'second'] }, context: { ci: { job: 'review' } } };
  return [
    { ...common, phase: 'start' },
    { ...common, phase: 'prepared', request: { requestId: 'a'.repeat(64), scope: { kind: 'proposed-task' } } },
    { ...common, phase: 'terminal', request: { requestId: 'a'.repeat(64), scope: { kind: 'proposed-task' } }, completedAt: '2026-01-01T00:00:00.250Z', elapsedMs: 250,
      state: 'completed', decision: { decision: 'PASS', findings: [{ title: 'finding' }] }, findingCount: 1 }
  ];
}
function dataset(observations = records()) {
  return { version: 1, records: observations, population: [{ changeId: 'change-1', eligible: true, cohort: 'natural', domain: 'self', initialRef: 'initial', finalRef: 'final' }], cases: [], audits: [] };
}
function linkedDataset(observations = records()) {
  const data = dataset(observations);
  data.cases = [{ caseId: 'case-1', changeId: 'change-1', kind: 'architecture-violation', adjudication: 'valid', disposition: 'corrected',
    findingRefs: [{ attemptId, index: 0 }], evidence: ['assessor evidence'], adjudicator: 'independent assessor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', resolvedBeforeCI: true }];
  data.audits = [{ changeId: 'change-1', blinded: true, auditor: 'independent auditor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', evidence: ['blind review'],
    initialViolationCaseIds: ['case-1'], finalViolationCaseIds: [] }];
  return data;
}
function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectKeys(item)]));
}

test('identical duplicate observations across all phases normalize before aggregation and sampling', () => {
  const control = dataset();
  const inputRecords = control.records.flatMap(record => [record, reverseObjectKeys(record)]);
  const input = dataset(inputRecords);
  const normalized = validateMeasurementDataset(input);
  assert.equal(normalized.records.length, 3);
  assert.equal(input.records.length, 6, 'validation leaves the caller export unchanged');
  assert.notEqual(normalized, input);
  assert.equal(validateMeasurementDataset(control), control, 'datasets without duplicates retain identity');
  assert.deepEqual(aggregateMeasurement(input), aggregateMeasurement(control));
  assert.deepEqual(sampleMeasurementPopulation(input, { seed: 'frozen-seed', count: 1 }),
    sampleMeasurementPopulation(control, { seed: 'frozen-seed', count: 1 }));
  const report = aggregateMeasurement(input);
  assert.equal(report.coverage.attempts, 1);
  assert.equal(report.overhead.latencySamples, 1);
  assert.equal(report.overhead.repeatedAttempts, 0);
});

test('linked audit metrics and CLI aggregate/sample ignore repeated redacted export records', t => {
  const privateControl = linkedDataset();
  const privateRepeated = linkedDataset(privateControl.records.flatMap(record => [record, reverseObjectKeys(record)]));
  const report = aggregateMeasurement(privateControl);
  assert.deepEqual(aggregateMeasurement(privateRepeated), report);
  assert.equal(report.counts.validDetectedCases, 1);
  assert.equal(report.metrics.localEarlyResolution.numerator, 1);
  assert.equal(report.coverage.attempts, 1);
  assert.equal(report.overhead.latencySamples, 1);
  assert.equal(privateRepeated.records.length, 6, 'validation must not mutate the supplied dataset');

  const changeId = measurementDigest('change-1');
  const redactedRecords = privateControl.records.map(redactMeasurement);
  const exported = { version: 1, records: redactedRecords, population: [{ ...privateControl.population[0], changeId }],
    cases: privateControl.cases.map(item => ({ ...item, changeId })), audits: privateControl.audits.map(item => ({ ...item, changeId })), collectionGaps: 0 };
  const duplicateExport = { ...exported, records: exported.records.flatMap(record => [record, reverseObjectKeys(record)]) };
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-measurement-duplicate-cli-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const inputPath = join(parent, 'dataset.json');
  writeFileSync(inputPath, JSON.stringify(duplicateExport));
  assert.deepEqual(runMeasurementCli(['aggregate', inputPath]), aggregateMeasurement(exported));
  assert.deepEqual(runMeasurementCli(['sample', inputPath, 'frozen-seed', '1']), sampleMeasurementPopulation(exported, { seed: 'frozen-seed', count: 1 }));
});

test('all start/prepared/terminal subsets count observed attempts without inventing review outcomes', () => {
  const complete = records();
  const phaseNames = ['start', 'prepared', 'terminal'];
  for (let mask = 1; mask < 8; mask++) {
    const selected = complete.filter(record => mask & (1 << phaseNames.indexOf(record.phase))).map(record => {
      if (record.phase === 'terminal') return record;
      return { ...record, state: 'completed', decision: { decision: 'PASS' } };
    });
    const report = aggregateMeasurement(dataset(selected));
    const hasTerminal = Boolean(mask & 4);
    const hasStart = Boolean(mask & 1);
    assert.equal(report.coverage.attempts, 1, `phase mask ${mask}`);
    assert.equal(report.coverage.observed, 1, `phase mask ${mask}`);
    assert.equal(report.coverage.noObservation, 0, `phase mask ${mask}`);
    assert.equal(report.coverage.states[hasTerminal ? 'completed' : 'missing'], 1, `phase mask ${mask}`);
    assert.equal(report.coverage.reviewed, hasTerminal ? 1 : 0, `phase mask ${mask}`);
    assert.deepEqual(report.coverage.completedByScope, hasTerminal ? { 'proposed-task': 1 } : {}, `phase mask ${mask}`);
    assert.equal(report.overhead.latencySamples, hasTerminal ? 1 : 0, `phase mask ${mask}`);
    assert.equal(report.coverage.terminalWithoutStart, hasTerminal && !hasStart ? 1 : 0, `phase mask ${mask}`);
  }

  const noObservation = dataset([]);
  const unknown = { ...complete[1], attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', changeId: 'unknown-change' };
  const withUnknown = aggregateMeasurement({ ...noObservation, records: [unknown] });
  assert.equal(withUnknown.coverage.observed, 0);
  assert.equal(withUnknown.coverage.noObservation, 1);
  assert.equal(withUnknown.coverage.attempts, 0);
  assert.equal(withUnknown.coverage.unlinkedAttempts, 1);

  const ciOutcome = { ...complete[0], attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', route: 'ci-outcome' };
  const withCiOutcome = aggregateMeasurement({ ...noObservation, records: [ciOutcome] });
  assert.equal(withCiOutcome.coverage.observed, 0);
  assert.equal(withCiOutcome.coverage.unlinkedAttempts, 0);
});

test('reviewed coverage requires a completed terminal with a known decision kind', () => {
  for (const decision of ['PASS', 'BLOCK', 'OWNER_DECISION']) {
    const privateReport = aggregateMeasurement(dataset([{ ...records()[2], decision: { decision } }]));
    assert.equal(privateReport.coverage.reviewed, 1, `${decision} private decision`);
    const redactedReport = aggregateMeasurement(dataset([{ ...records()[2], decision }]));
    assert.equal(redactedReport.coverage.reviewed, 1, `${decision} redacted decision`);
  }
  for (const decision of [null, 'unrecognized-kind', { decision: 'unrecognized-kind' }, { other: 'PASS' }]) {
    const report = aggregateMeasurement(dataset([{ ...records()[2], decision }]));
    assert.equal(report.coverage.observed, 1);
    assert.equal(report.coverage.reviewed, 0);
    assert.equal(report.coverage.completedByScope['proposed-task'], 1, 'completed diagnostic terminal still counts by scope');
  }
  const nonterminal = { ...records()[1], state: 'completed', decision: { decision: 'PASS' } };
  const report = aggregateMeasurement(dataset([nonterminal]));
  assert.equal(report.coverage.observed, 1);
  assert.equal(report.coverage.reviewed, 0);
  assert.deepEqual(report.coverage.completedByScope, {});
});

test('duplicate identity rejects any differing field, including private and redacted data', () => {
  for (const [phase, mutate] of [
    ['start', record => { record.context.ci.job = 'measurement'; }],
    ['prepared', record => { record.request.requestId = 'different'; }],
    ['terminal', record => { record.decision.privateNarrative = 'changed'; }]
  ]) {
    const observations = records();
    const first = observations.find(record => record.phase === phase);
    const conflicting = structuredClone(first);
    mutate(conflicting);
    assert.throws(() => validateMeasurementDataset(dataset([...observations, conflicting])), /conflicting duplicate observation/);
  }
  const redacted = { ...records()[0], requestId: 'a'.repeat(64) };
  assert.throws(() => validateMeasurementDataset(dataset([redacted, { ...redacted, requestId: 'b'.repeat(64) }])), /conflicting duplicate observation/);
  const arrayOrder = records()[0];
  assert.throws(() => validateMeasurementDataset(dataset([arrayOrder, { ...arrayOrder, runtime: { package: 'fixture', flags: ['second', 'first'] } }])), /conflicting duplicate observation/);
  const presence = records()[0];
  assert.throws(() => validateMeasurementDataset(dataset([presence, { ...presence, unknownPrivateField: 'only present once' }])), /conflicting duplicate observation/);
});

test('duplicate normalization still rejects conflicting prepared and terminal requests', () => {
  const observations = records();
  observations[1].request.requestId = 'prepared-id';
  observations[2].request.requestId = 'terminal-id';
  assert.throws(() => validateMeasurementDataset(dataset(observations)), /conflicting phase request metadata/);
});
