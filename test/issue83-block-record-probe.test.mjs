import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildSyntheticBlockRecord } from '../scripts/issue83-block-record-probe.mjs';

const root = resolve(import.meta.dirname, '..');
const schemaPath = join(root, '.codex/gatekeeper/ci-decision.schema.json');
const validationPath = join(root, '.codex/gatekeeper/decision.validation.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
const context = {
  repository: 'flair-agency/architecture-gatekeeper',
  workflowSha: 'a'.repeat(40),
  runId: '123',
  runAttempt: '1',
};

function decision() {
  return {
    decision: 'BLOCK', summary: 'Synthetic violation', authority: ['protected architecture'],
    authorityFiles: ['docs/architecture.md'], authorityIds: ['architecture-contract'],
    responsibility: ['acceptance'], capabilitySurface: ['CI'], qualityGuarantees: ['fail closed'],
    reviewedScope: ['synthetic fixture'], prohibitedChanges: ['pass on service failure'],
    gates: {
      sharedMechanism: {
        decision: 'BLOCK', summary: 'violates fail closed', consumerOwnership: '',
        failClosedBehavior: 'violated', compatibility: '', minimality: '',
      },
      trustBoundary: {
        decision: 'BLOCK', summary: 'untrusted failure becomes accepted', tokenPermissions: '',
        untrustedInputs: '', credentialHandling: '', reportingIsolation: '',
      },
    },
  };
}

test('synthetic producer records only a schema-valid, complete BLOCK', () => {
  const result = buildSyntheticBlockRecord(decision(), schema, validation, context);
  assert.equal(result.kind, 'synthetic-validated-block-probe-not-review-evidence');
  assert.equal(result.decision.decision, 'BLOCK');
  assert.match(result.decisionSha256, /^[a-f0-9]{64}$/);
  for (const alternative of ['PASS', 'OWNER_DECISION']) {
    const other = decision(); other.decision = alternative;
    other.gates.sharedMechanism.decision = alternative;
    other.gates.trustBoundary.decision = alternative;
    assert.throws(() => buildSyntheticBlockRecord(other, schema, validation, context), /Only a completed BLOCK/);
  }
});

test('incomplete authority and malformed output cannot produce a record', () => {
  const incomplete = decision(); incomplete.authorityIds = [];
  assert.throws(() => buildSyntheticBlockRecord(incomplete, schema, validation, context), /too few items|complete Authority ID set/);
  const malformed = decision(); delete malformed.gates;
  assert.throws(() => buildSyntheticBlockRecord(malformed, schema, validation, context), /required/);
});

test('failed validation leaves no output file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'issue83-block-probe-'));
  const input = join(dir, 'decision.json');
  const output = join(dir, 'record.json');
  writeFileSync(input, JSON.stringify({ ...decision(), decision: 'PASS' }));
  const result = spawnSync(process.execPath, [join(root, 'scripts/issue83-block-record-probe.mjs'), input, schemaPath, validationPath, output], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REPOSITORY: context.repository,
      GITHUB_WORKFLOW_SHA: context.workflowSha,
      GITHUB_RUN_ID: context.runId,
      GITHUB_RUN_ATTEMPT: context.runAttempt,
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(output), false);

  writeFileSync(input, Buffer.concat([
    Buffer.from('{"decision":"BLOCK","summary":"'), Buffer.from([0xff]), Buffer.from('"}'),
  ]));
  const invalidUtf8 = spawnSync(process.execPath, [join(root, 'scripts/issue83-block-record-probe.mjs'), input, schemaPath, validationPath, output], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REPOSITORY: context.repository,
      GITHUB_WORKFLOW_SHA: context.workflowSha,
      GITHUB_RUN_ID: context.runId,
      GITHUB_RUN_ATTEMPT: context.runAttempt,
    },
  });
  assert.notEqual(invalidUtf8.status, 0);
  assert.equal(existsSync(output), false);
});
