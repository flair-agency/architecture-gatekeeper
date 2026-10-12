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


test('blank and control-bearing assessor identities cannot contribute to metrics or audit packets', () => {
  for (const [section, field] of [['cases', 'adjudicator'], ['audits', 'auditor']]) for (const invalid of ['', ' ', '\t', '\0', 'assessor\n', ...Array.from({length:32},(_,i)=>String.fromCharCode(0x80+i))]) {
    const data = baseDataset(); data[section][0][field] = invalid;
    for (const run of [validateMeasurementDataset, aggregateMeasurement, d => sampleMeasurementPopulation(d, { seed: 'fixed', count: 1 })]) assert.throws(() => run(data), /assessor|evidence/);
  }
  for (const invalid of [' ', '\t', '\0']) {
    const population = baseDataset(); population.population[0].changeId = invalid;
    assert.throws(() => validateMeasurementDataset(population), /population identity/);
    const cases = baseDataset(); cases.cases[0].caseId = invalid;
    assert.throws(() => validateMeasurementDataset(cases), /case identity/);
    assert.throws(() => sampleMeasurementPopulation(baseDataset(), { seed: invalid, count: 1 }), /seed/);
  }
});


test('resolution timing accepts only boolean or explicitly unknown values in all APIs', () => {
  for (const run of [validateMeasurementDataset, aggregateMeasurement, d=>sampleMeasurementPopulation(d,{seed:'fixed',count:1})]) {
    for (const value of ['true','false',0,1,{},[]]) {
      const data=baseDataset();data.cases[0].resolvedBeforeCI=value;assert.throws(()=>run(data),/resolution timing boolean/);
    }
    for (const value of [undefined,null,false,true]) {
      const data=baseDataset();data.cases[0].resolvedBeforeCI=value;assert.doesNotThrow(()=>run(data));
      assert.equal(aggregateMeasurement(data).metrics.localEarlyResolution.numerator,value===true?1:0);
    }
  }
});

test('all Unicode C1 controls are refused by identities, references and sampling seeds', () => {
  for (let code=0x80;code<=0x9f;code++) {
    const value=String.fromCharCode(code);
    for (const change of [d=>{d.population[0].cohort='natural';d.population[0].initialRef=value;},d=>{d.cases[0].evidence=[value];},d=>{d.audits[0].evidence=[value];},d=>{d.cases[0].caseId=value;}]) {
      const data=baseDataset();change(data);assert.throws(()=>validateMeasurementDataset(data),/reference|evidence|identity/);
    }
    assert.throws(()=>sampleMeasurementPopulation(baseDataset(),{seed:value,count:1}),/seed/);
  }
});

test('audits bind every known frozen population revision; absent revisions remain unknown', () => {
  for (const field of ['initialRef','finalRef']) {
    const data=baseDataset(); data.population[0][field]=data.audits[0][field];
    for (const run of [validateMeasurementDataset,aggregateMeasurement,d=>sampleMeasurementPopulation(d,{seed:'fixed',count:1})]) {
      assert.doesNotThrow(()=>run(data));
      const mismatch=structuredClone(data); mismatch.audits[0][field]='different revision';
      assert.throws(()=>run(mismatch),/audit sampled revision/);
      const unknown=structuredClone(data); delete unknown.population[0][field]; assert.doesNotThrow(()=>run(unknown));
      unknown.population[0][field]=null; assert.doesNotThrow(()=>run(unknown));
    }
  }
});
test('format-only identities, references and seeds are unusable; visible international text survives', () => {
  const invalid=['\u200b','\u2060',' \u200b\u200d ','\u00ad','\ufeff\u2060'];
  for (const value of invalid) {
    for (const change of [d=>{d.cases[0].adjudicator=value;},d=>{d.audits[0].auditor=value;},d=>{d.cases[0].evidence=[value];},d=>{d.population[0].initialRef=value;}]) {
      const data=baseDataset();change(data);
      for (const run of [validateMeasurementDataset,aggregateMeasurement,d=>sampleMeasurementPopulation(d,{seed:'fixed',count:1})]) assert.throws(()=>run(data),/assessor|evidence|reference/);
    }
    assert.throws(()=>sampleMeasurementPopulation(baseDataset(),{seed:value,count:1}),/seed/);
  }
  for (const value of ['日本語','👩‍💻','a\u200db']) {
    const data=baseDataset();data.cases[0].adjudicator=value; assert.doesNotThrow(()=>validateMeasurementDataset(data));
    assert.doesNotThrow(()=>sampleMeasurementPopulation(data,{seed:value,count:1}));
  }
});
test('scope counts retain bounded string labels and classify malformed observations as unknown', () => {
  for (const field of ['private','exported']) for (const value of [true,42,[],['a','b'],{},'', ' ', 'x'.repeat(201),'a\nb','\u200b']) {
    const data=baseDataset(); if(field==='private') data.records[0].request={scope:{kind:value}}; else data.records[0].scopeKind=value;
    assert.deepEqual(aggregateMeasurement(data).coverage.completedByScope,{unknown:1});
  }
  for(const value of ['tracked-working-tree','__proto__','constructor']) {
    const data=baseDataset();data.records[0].scopeKind=value;
    assert.deepEqual(aggregateMeasurement(data).coverage.completedByScope,{[value]:1});
  }
});
