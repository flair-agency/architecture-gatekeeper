import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMeasurement } from '../dist/measurement-analysis.mjs';

const baseTime = Date.parse('2026-10-01T00:00:00.000Z');
function dataset(elapsedSamples) {
  return { version: 1,
    records: elapsedSamples.map((elapsed, index) => ({
      version: 1, kind: 'agk-diagnostic', attemptId: `${String(index + 1).padStart(8, '0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
      phase: 'terminal', route: 'manual', startedAt: new Date(baseTime).toISOString(),
      completedAt: new Date(baseTime + elapsed).toISOString(), state: 'completed', changeId: 'change-1',
    })),
    population: [{ changeId: 'change-1', eligible: true, cohort: 'natural', domain: 'self' }], cases: [], audits: [],
  };
}

test('odd latency samples use the middle sorted observation', () => {
  const result = aggregateMeasurement(dataset([1001, 1, 10]));
  assert.equal(result.overhead.latencySamples, 3);
  assert.equal(result.overhead.medianElapsedMs, 10);
});

test('even latency samples average the two sorted central observations', () => {
  const result = aggregateMeasurement(dataset([1001, 1]));
  assert.equal(result.overhead.latencySamples, 2);
  assert.equal(result.overhead.medianElapsedMs, 501);
});

test('empty and invalid negative intervals retain existing filtering behavior', () => {
  const empty = aggregateMeasurement(dataset([]));
  assert.equal(empty.overhead.latencySamples, 0);
  assert.equal(empty.overhead.medianElapsedMs, null);
  const filtered = aggregateMeasurement(dataset([-100, 3, 1]));
  assert.equal(filtered.overhead.latencySamples, 2);
  assert.equal(filtered.overhead.medianElapsedMs, 2);
});
