import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMeasurement } from '../dist/measurement-analysis.mjs';

function dataset(localStarted, localCompleted, ciStarted, ciCompleted) {
  const record = (id, route, startedAt, completedAt) => ({ version: 1, kind: 'agk-diagnostic',
    attemptId: id.repeat(8) + '-aaaa-aaaa-aaaa-aaaaaaaaaaaa', phase: 'terminal', route,
    startedAt, completedAt, state: 'completed', changeId: 'change-1', findingCount: 1, decision: 'BLOCK' });
  const records = [record('a', 'manual', localStarted, localCompleted), record('b', 'ci-review', ciStarted, ciCompleted)];
  return { version: 1, records,
    population: [{ changeId: 'change-1', eligible: true, cohort: 'natural', domain: 'self' }],
    cases: [{ caseId: 'violation', changeId: 'change-1', kind: 'architecture-violation', adjudication: 'valid', disposition: 'corrected',
      resolvedBeforeCI: true, findingRefs: records.map(r => ({ attemptId: r.attemptId, index: 0 })),
      adjudicator: 'independent assessor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', evidence: ['synthetic case adjudication'] }],
    audits: [] };
}
const instant = seconds => `2026-10-01T00:00:${String(seconds).padStart(2, '0')}.000Z`;

test('a CI attempt starting first cannot displace an earlier completed local detection', () => {
  const report = aggregateMeasurement(dataset(instant(10), instant(20), instant(0), instant(30)));
  assert.deepEqual(report.metrics.localEarlyResolution, { numerator: 1, denominator: 1, rate: 1 });
  assert.equal(report.cases[0].firstDetection, 'local');
});

test('a local attempt starting first cannot claim first detection when CI finishes earlier', () => {
  const report = aggregateMeasurement(dataset(instant(0), instant(30), instant(10), instant(20)));
  assert.equal(report.metrics.localEarlyResolution.numerator, 0);
  assert.equal(report.cases[0].firstDetection, 'ci');
});

test('equal earliest local and CI instants remain ambiguous regardless of input order or timezone text', () => {
  const data = dataset(instant(0), instant(20), instant(10), '2026-10-01T09:00:20+09:00');
  for (const reverse of [false, true]) {
    const ordered = structuredClone(data);
    if (reverse) { ordered.records.reverse(); ordered.cases[0].findingRefs.reverse(); }
    const report = aggregateMeasurement(ordered);
    assert.deepEqual(report.metrics.localEarlyResolution, { numerator: 0, denominator: 1, rate: 0 });
    assert.equal(report.counts.ambiguousFirstDetectionCases, 1);
    assert.equal(report.cases[0].firstDetection, 'ambiguous');
  }
});

test('a tie among local routes alone is local and still requires explicit early-resolution adjudication', () => {
  const data = dataset(instant(0), instant(20), instant(10), instant(30));
  const native = { ...data.records[0], attemptId: 'cccccccc-aaaa-aaaa-aaaa-aaaaaaaaaaaa', route: 'native' };
  data.records.push(native); data.cases[0].findingRefs.push({ attemptId: native.attemptId, index: 0 });
  let report = aggregateMeasurement(data);
  assert.equal(report.metrics.localEarlyResolution.numerator, 1);
  assert.equal(report.counts.ambiguousFirstDetectionCases, 0);
  data.cases[0].resolvedBeforeCI = false;
  report = aggregateMeasurement(data);
  assert.equal(report.metrics.localEarlyResolution.numerator, 0);
  assert.equal(report.cases[0].firstDetection, 'local');
});

test('a resolved case without linked detection stays unknown and remains in the local denominator', () => {
  const data = dataset(instant(0), instant(20), instant(10), instant(30));
  data.records = []; data.cases[0].findingRefs = [];
  const report = aggregateMeasurement(data);
  assert.deepEqual(report.metrics.localEarlyResolution, { numerator: 0, denominator: 1, rate: 0 });
  assert.equal(report.cases[0].firstDetection, 'unknown');
});
