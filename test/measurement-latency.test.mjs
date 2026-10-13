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

test('independent CI collection time never becomes review latency', () => {
  const data=dataset([1]);data.records[0].route='ci-review';
  data.records[0].observation={timingSource:'collector',ciAcquisition:'unavailable'};
  assert.equal(aggregateMeasurement(data).overhead.latencySamples,0);
  data.records[0].observation={timingSource:'collector',ciAcquisition:'public-job-metadata',jobTiming:{startedAt:'2025-01-01T00:00:00Z',completedAt:'2025-01-01T00:00:10Z',elapsedMs:10000}};
  assert.equal(aggregateMeasurement(data).overhead.latencySamples,0);
  data.records[0].observation.reviewTiming={startedAt:'2025-01-01T00:00:02Z',completedAt:'2025-01-01T00:00:09Z',elapsedMs:7000};
  assert.equal(aggregateMeasurement(data).overhead.medianElapsedMs,7000);
  data.records[0].observation.jobTiming.elapsedMs=1;
  assert.equal(aggregateMeasurement(data).overhead.latencySamples,0);
});

test('inconsistent observed review-step timing remains unknown without job or collector fallback',()=>{
  for(const patch of [null,{elapsedMs:1},{startedAt:'2024-12-31T23:59:59Z',elapsedMs:10000},{completedAt:'2025-01-01T00:00:11Z',elapsedMs:9000},{startedAt:'2025-02-30T00:00:02Z'}]){
    const data=dataset([1]);data.records[0].route='ci-review';data.records[0].observation={timingSource:'collector',ciAcquisition:'public-job-metadata',jobTiming:{startedAt:'2025-01-01T00:00:00Z',completedAt:'2025-01-01T00:00:10Z',elapsedMs:10000},reviewTiming:patch===null?null:{startedAt:'2025-01-01T00:00:02Z',completedAt:'2025-01-01T00:00:09Z',elapsedMs:7000,...patch}};
    const result=aggregateMeasurement(data);assert.equal(result.overhead.latencySamples,0);assert.equal(result.overhead.medianElapsedMs,null);
  }
});
