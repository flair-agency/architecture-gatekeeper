import test from 'node:test';

import assert from 'node:assert/strict';

import { aggregateMeasurement, sampleMeasurementPopulation, validateMeasurementDataset } from '../dist/measurement-analysis.mjs';

const pass = { decision: 'PASS', summary: 'private summary', authorityFiles: ['AGENTS.md'], reviewedScope: ['private scope'], findings: [] };

const block = { ...pass, decision: 'BLOCK', findings: [{ title: 'private finding', details: 'secret details' }] };

function dataset() {
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; const ci = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; const pending = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const base = { version: 1, kind: 'agk-diagnostic', startedAt: '2026-10-01T00:00:00Z', changeId: 'change-1', route: 'manual' };
  const records = [
    { ...base, attemptId: id, phase: 'start' }, { ...base, attemptId: id, phase: 'terminal', completedAt: '2026-10-01T00:00:01Z', state: 'completed', decision: block },
    { ...base, attemptId: ci, route: 'ci-review', phase: 'terminal', completedAt: '2026-10-01T00:00:02Z', state: 'completed', decision: block },
    { ...base, attemptId: pending, changeId: 'change-2', phase: 'start' }];
  const evidence = { adjudicator: 'assessor', initialRef: 'initial snapshot', finalRef: 'final commit', authorityRef: 'authority revision', evidence: ['review notes'] };
  return { version: 1, plan: { window: 'fixed fixture window' }, records,
    population: [1,2,3].map(n => ({ changeId: `change-${n}`, eligible: true, cohort: 'natural', domain: 'self' })),
    cases: [{ ...evidence, caseId: 'defect', changeId: 'change-1', kind: 'architecture-violation', adjudication: 'valid', disposition: 'corrected', resolvedBeforeCI: true, findingRefs: [{ attemptId: id, index: 0 }, { attemptId: ci, index: 0 }] },
      { ...evidence, caseId: 'miss', changeId: 'change-3', kind: 'architecture-violation', adjudication: 'valid', disposition: 'integrated-violation', findingRefs: [] }],
    audits: [{ changeId: 'change-1', blinded: true, auditor: 'independent assessor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', evidence: ['audit'], initialViolationCaseIds: ['defect'], finalViolationCaseIds: [] },
      { changeId: 'change-3', blinded: true, auditor: 'independent assessor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', evidence: ['audit'], initialViolationCaseIds: ['miss'], finalViolationCaseIds: ['miss'] }] };
}

test('deduplicates local-to-CI cases, reports misses and explicit denominators, leaves missing scope unknown', () => {
  const data = dataset(); const result = aggregateMeasurement(data);
  assert.deepEqual(result.metrics.precision, { numerator: 1, denominator: 1, rate: 1 });
  assert.equal(result.metrics.recall.rate, 0.5); assert.equal(result.metrics.integratedDriftIncidence.rate, 0.5);
  assert.equal(result.metrics.validFindingResolution.denominator, 1); assert.equal(result.metrics.localEarlyResolution.numerator, 1);
  assert.equal(result.coverage.states.missing, 1); assert.equal(result.coverage.noObservation, 1); assert.equal(result.coverage.terminalWithoutStart, 1);
  assert.equal(result.cases[0].repeats, 1); assert.match(result.interpretation, /no causal/);
  const sample = sampleMeasurementPopulation(data, { seed: 'fixed', count: 3 });
  assert.equal(sample.sample.length, 3); assert.ok(!JSON.stringify(sample).includes('BLOCK')); assert.ok(!JSON.stringify(sample).includes('defect'));
  assert.deepEqual(sample, sampleMeasurementPopulation(data, { seed: 'fixed', count: 3 }));
  data.cases.push({ ...data.cases[0] }); assert.throws(() => aggregateMeasurement(data), /case identity/);
});

test('PASS transitions do not resolve cases, and known dispositions need evidence', () => {
  const data = dataset(); data.cases[0].disposition = 'unresolved';
  assert.equal(aggregateMeasurement(data).metrics.validFindingResolution.rate, null);
  assert.equal(aggregateMeasurement(data).counts.unresolvedCases, 1);
  data.cases[0].disposition = 'corrected'; data.cases[0].evidence = [];
  assert.throws(() => aggregateMeasurement(data), /evidence/);
});


test('all object entrypoints enforce whole-dataset JSON size, depth and shape', () => {
  for (const run of [validateMeasurementDataset, aggregateMeasurement, d => sampleMeasurementPopulation(d, { seed: 'fixed', count: 1 })]) {
    for (const mutate of [
      d => { d.plan = { notes: 'x'.repeat(1024 * 1024) }; },
      d => { d.plan = {}; d.plan.self = d.plan; },
      d => { let deep = {}; for (let i = 0; i < 34; i++) deep = { nested: deep }; d.plan = deep; },
      d => { d.plan = new Date(); },
      d => { d.plan = new Array(1024 * 1024); },
      d => { d.plan = { toJSON() { throw new Error('must not call'); } }; },
    ]) { const data = dataset(); mutate(data); assert.throws(() => run(data), /JSON (limit|depth|shape)/); }
    const valid = dataset(); const normalized = validateMeasurementDataset(valid);
    valid.plan.window = 'changed after validation'; assert.equal(normalized.plan.window, 'fixed fixture window');
    assert.doesNotThrow(() => JSON.stringify(run(normalized)));
  }
});


test('local resolution denominator retains audited resolutions with no detection observation', () => {
  for (const disposition of ['corrected', 'withdrawn']) {
    const data = dataset(); data.cases[1].disposition = disposition; data.audits[1].finalViolationCaseIds = [];
    const mixed = aggregateMeasurement(data);
    assert.deepEqual(mixed.metrics.localEarlyResolution, { numerator: 1, denominator: 2, rate: 0.5 });
    assert.deepEqual(mixed.metrics.validFindingResolution, { numerator: 1, denominator: 1, rate: 1 });
    data.cases = [data.cases[1]]; data.audits = [data.audits[1]];
    const undetected = aggregateMeasurement(data);
    assert.deepEqual(undetected.metrics.localEarlyResolution, { numerator: 0, denominator: 1, rate: 0 });
    assert.equal(undetected.cases[0].firstDetection, 'unknown');
  }
});


test('collection gap counts distinguish absent or unknown from malformed data in every API', () => {
  for (const run of [validateMeasurementDataset, aggregateMeasurement, d => sampleMeasurementPopulation(d, {seed:'fixed',count:1})]) {
    for (const value of ['0',-1,0.5,Number.MAX_SAFE_INTEGER+1,{},[],true]) {
      const data=dataset();data.collectionGaps=value;assert.throws(()=>run(data),/collection gap count/);
    }
    for (const value of [undefined,null,0,7,Number.MAX_SAFE_INTEGER]) {
      const data=dataset();data.collectionGaps=value;assert.doesNotThrow(()=>run(data));
      assert.equal(aggregateMeasurement(data).coverage.collectionGaps,value??null);
    }
  }
});
