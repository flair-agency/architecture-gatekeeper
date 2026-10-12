import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMeasurement, sampleMeasurementPopulation, validateMeasurementDataset } from '../dist/measurement-analysis.mjs';

const startTime = '2026-10-01T00:00:00.000Z';
const terminalTime = '2026-10-01T00:00:01.000Z';
function id(number) { return `${String(number).padStart(8, '0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`; }
function terminal(number, changeId, decision = null) {
  return { version: 1, kind: 'agk-diagnostic', attemptId: id(number), phase: 'terminal', route: 'manual',
    startedAt: startTime, completedAt: terminalTime, state: 'completed', ...(changeId === undefined ? {} : { changeId }),
    ...(decision === null ? {} : { decision }) };
}
function baseDataset() {
  const selectedAttempt = id(1);
  return { version: 1,
    records: [terminal(1, 'natural-self', { decision: 'BLOCK', findings: [{}] })],
    population: [{ changeId: 'natural-self', eligible: true, cohort: 'natural', domain: 'self' }],
    cases: [{ caseId: 'defect', changeId: 'natural-self', kind: 'architecture-violation', adjudication: 'valid',
      disposition: 'corrected', findingRefs: [{ attemptId: selectedAttempt, index: 0 }], evidence: ['review record'],
      adjudicator: 'assessor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', resolvedBeforeCI: true }],
    audits: [{ changeId: 'natural-self', blinded: true, auditor: 'independent assessor', initialRef: 'initial',
      finalRef: 'final', authorityRef: 'authority', evidence: ['audit'], initialViolationCaseIds: ['defect'], finalViolationCaseIds: [] }],
  };
}

test('other declared cohort and ineligible population links do not alter selected metrics or count as unlinked', () => {
  const selectedOnly = baseDataset();
  const mixed = baseDataset();
  mixed.population.push(
    { changeId: 'fixture-self', eligible: true, cohort: 'fixture', domain: 'self' },
    { changeId: 'natural-consumer', eligible: true, cohort: 'natural', domain: 'consumer' },
    { changeId: 'ineligible-natural-self', eligible: false, cohort: 'natural', domain: 'self' },
  );
  mixed.records.push(terminal(2, 'fixture-self'), terminal(3, 'natural-consumer'), terminal(4, 'ineligible-natural-self'));

  const expected = aggregateMeasurement(selectedOnly);
  const actual = aggregateMeasurement(mixed);
  assert.deepEqual(actual.metrics, expected.metrics);
  for (const key of ['eligible', 'reviewed', 'observed', 'noObservation', 'attempts', 'states', 'completedByScope', 'terminalWithoutStart']) {
    assert.deepEqual(actual.coverage[key], expected.coverage[key]);
  }
  assert.equal(actual.coverage.unlinkedAttempts, 0);
});

test('counts distinct attempts whose change ID is unknown or missing', () => {
  const data = baseDataset();
  const unknownId = id(5); const missingId = id(6);
  data.records.push(
    { ...terminal(5, 'not-declared'), phase: 'start', completedAt: undefined, state: undefined },
    terminal(5, 'not-declared'),
    { ...terminal(6, undefined), attemptId: missingId, phase: 'start', completedAt: undefined, state: undefined },
    { ...terminal(6, undefined), attemptId: missingId },
  );
  assert.notEqual(unknownId, missingId);
  assert.equal(aggregateMeasurement(data).coverage.unlinkedAttempts, 2);
});


test('final audit violations require an integrated-violation disposition', () => {
  for (const disposition of ['corrected', 'withdrawn', 'authorized-evolution', 'rejected-proposal', 'unresolved']) {
    const data = baseDataset(); data.cases[0].disposition = disposition;
    data.audits[0].finalViolationCaseIds = ['defect'];
    assert.throws(() => aggregateMeasurement(data), /final audit disposition/, disposition);
  }
  const integrated = baseDataset(); integrated.cases[0].disposition = 'integrated-violation';
  integrated.audits[0].finalViolationCaseIds = ['defect'];
  const remaining = aggregateMeasurement(integrated);
  assert.equal(remaining.metrics.validFindingResolution.numerator, 0);
  assert.equal(remaining.metrics.integratedDriftIncidence.numerator, 1);
  for (const disposition of ['corrected', 'withdrawn']) {
    const resolved = baseDataset(); resolved.cases[0].disposition = disposition;
    const report = aggregateMeasurement(resolved);
    assert.equal(report.metrics.validFindingResolution.numerator, 1);
    assert.equal(report.metrics.integratedDriftIncidence.numerator, 0);
  }
});


test('final audit cannot omit a known integrated violation, including an undetected case', () => {
  for (const findingRefs of [[], baseDataset().cases[0].findingRefs]) {
    const data = baseDataset(); data.cases[0].disposition = 'integrated-violation'; data.cases[0].findingRefs = findingRefs;
    assert.throws(() => aggregateMeasurement(data), /final audit omits integrated violation/);
    data.audits[0].finalViolationCaseIds = ['defect'];
    assert.equal(aggregateMeasurement(data).metrics.integratedDriftIncidence.numerator, 1);
  }
  const unaudited = baseDataset(); unaudited.cases[0].disposition = 'integrated-violation'; unaudited.audits = [];
  assert.equal(aggregateMeasurement(unaudited).metrics.integratedDriftIncidence.rate, null);
});

test('finding references require review results and coherent private or exported counts', () => {
  for (const mutation of [
    r => { r.route = 'ci-outcome'; },
    r => { r.findingCount = 2; },
    r => { r.decision = null; r.findingCount = 1; },
    r => { r.decision = 'unrecognized'; r.findingCount = 1; },
    r => { r.state = 'incomplete'; },
  ]) {
    const data = baseDataset(); mutation(data.records[0]);
    assert.throws(() => aggregateMeasurement(data), /finding reference/);
  }
  const exported = baseDataset(); exported.records[0].decision = 'BLOCK'; exported.records[0].findingCount = 1;
  assert.equal(aggregateMeasurement(exported).metrics.precision.numerator, 1);
  for (const count of [-1, 0, 0.5, '1', null]) {
    const invalid = structuredClone(exported); invalid.records[0].findingCount = count;
    assert.throws(() => aggregateMeasurement(invalid), /finding reference/);
  }
});

test('scope counts preserve hostile object-key names as ordinary diagnostic labels', () => {
  const data = baseDataset(); data.records[0].scopeKind = '__proto__';
  data.records.push({ ...data.records[0], attemptId: id(2), scopeKind: 'constructor' });
  const counts = aggregateMeasurement(data).coverage.completedByScope;
  assert.equal(Object.getPrototypeOf(counts), Object.prototype);
  assert.equal(Object.hasOwn(counts, '__proto__'), true);
  assert.equal(counts.__proto__, 1); assert.equal(counts.constructor, 1);
  assert.equal(JSON.parse(JSON.stringify(counts)).__proto__, 1);
});


test('packet references reject structured, blank, oversized and control-bearing values across APIs', () => {
  for (const field of ['initialRef', 'finalRef']) for (const value of [{ decision: 'BLOCK' }, ['BLOCK'], true, 1, '', ' ', 'x'.repeat(201), 'a\nb', '\0ref']) {
    const data = baseDataset(); data.population[0][field] = value;
    for (const run of [validateMeasurementDataset, aggregateMeasurement, value => sampleMeasurementPopulation(value, { seed: 'fixed', count: 1 })]) assert.throws(() => run(data), /population reference/);
  }
  for (const section of ['cases', 'audits']) for (const field of ['initialRef', 'finalRef', 'authorityRef']) {
    const data = baseDataset(); data[section][0][field] = { decision: 'BLOCK' }; if (section === 'cases') data.cases[0].disposition = 'unresolved';
    assert.throws(() => validateMeasurementDataset(data), /reference|audit evidence/);
  }
});

test('object APIs reject changing accessor references without invoking them', () => {
  for (const run of [validateMeasurementDataset, aggregateMeasurement, d => sampleMeasurementPopulation(d, { seed: 'fixed', count: 1 })]) {
    const data = baseDataset(); let reads = 0;
    Object.defineProperty(data.population[0], 'initialRef', { enumerable: true, get() { reads++; return { decision: 'BLOCK' }; } });
    assert.throws(() => run(data), /JSON shape/); assert.equal(reads, 0);
  }
});

test('every case and audit evidence entry must be a bounded nonblank primitive reference', () => {
  for (const section of ['cases', 'audits']) for (const invalid of [null, {}, ['ref'], true, 42, '', ' ', 'x'.repeat(201), 'a\nb', '\0ref']) {
    const data = baseDataset(); data[section][0].evidence = ['valid reference', invalid];
    for (const run of [validateMeasurementDataset, aggregateMeasurement, d => sampleMeasurementPopulation(d, { seed: 'fixed', count: 1 })]) assert.throws(() => run(data), /evidence/);
  }
});
