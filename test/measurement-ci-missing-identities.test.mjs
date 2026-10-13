import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCiMeasurement } from '../dist/measurement-ci.mjs';
import { loadMeasurementDirectory, measurementDigest, redactMeasurement } from '../dist/measurement.mjs';

function observe(t, fields) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-ci-identities-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, 'records'); mkdirSync(directory, { mode: 0o700 });
  const prompt = join(parent, 'prompt'); const schema = join(parent, 'schema');
  writeFileSync(prompt, ''); writeFileSync(schema, '{}');
  const previous = process.env.GITHUB_OUTPUT;
  const output = join(parent, 'output'); writeFileSync(output, ''); process.env.GITHUB_OUTPUT = output;
  try { runCiMeasurement('start', { AGK_MEASUREMENT_DIR: directory, PROMPT_PATH: prompt, SCHEMA_PATH: schema, ...fields }); }
  finally { if (previous === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = previous; }
  return redactMeasurement(loadMeasurementDirectory(directory).records.find(r => r.phase === 'prepared'));
}

test('absent provenance stays unknown while an observed empty prompt retains its digest', t => {
  for (const fields of [{}, { AUTHORITY_PROVENANCE_BASE64: '', LEGACY_AUTHORITY_PROVENANCE_BASE64: '' }]) {
    const record = observe(t, fields);
    assert.equal(record.authorityProvenanceSha256, null);
    assert.equal(record.promptSha256, measurementDigest(''));
  }
});

test('selected modern or legacy provenance retains only the observed digest', t => {
  for (const [fields, value] of [
    [{ AUTHORITY_PROVENANCE_BASE64: 'modern', LEGACY_AUTHORITY_PROVENANCE_BASE64: 'legacy' }, 'modern'],
    [{ AUTHORITY_PROVENANCE_BASE64: '', LEGACY_AUTHORITY_PROVENANCE_BASE64: 'legacy' }, 'legacy'],
  ]) assert.equal(observe(t, fields).authorityProvenanceSha256, measurementDigest(value));
});

test('request identity requires both valid run identities instead of hashing missing values', t => {
  for (const fields of [{}, { GITHUB_RUN_ID: '12' }, { GITHUB_RUN_ATTEMPT: '1' },
    { GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '' }, { GITHUB_RUN_ID: 'undefined', GITHUB_RUN_ATTEMPT: '1' },
    { GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '0' }]) assert.equal(observe(t, fields).requestId, null);
  assert.equal(observe(t, { GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '1' }).requestId, measurementDigest('12/1/review'));
});
