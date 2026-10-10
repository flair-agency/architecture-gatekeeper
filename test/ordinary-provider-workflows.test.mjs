import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readWorkflow, namedStep, hasNeeds } from './helpers/workflow-structure.mjs';

const workflows = ['architecture-gate.yml', 'architecture-gate-providers.yml'].map(name =>
  readWorkflow(`../../.github/workflows/${name}`).workflow);

function verifyProviderBoundary(workflow) {
  const { policy, review, 'gemini-review': gemini, report, accept } = workflow.jobs;
  assert.equal(gemini.if, "needs.policy.outputs.mode == 'enforced' && needs.policy.outputs.provider == 'gemini'");
  assert.match(review.if, /needs\.policy\.outputs\.provider != 'gemini'/);
  assert.deepEqual(gemini.permissions, { contents: 'read', 'id-token': 'write' });
  assert.deepEqual(review.permissions, { contents: 'read' });
  assert.equal(report.permissions.actions, 'read');
  assert.equal(report.permissions['pull-requests'], 'write');
  assert.equal(report.permissions['id-token'], undefined);
  for (const job of [report, accept]) assert.ok(hasNeeds(job, 'gemini-review'));
  const checkout = namedStep(gemini, 'Check out the protected base; candidate revisions remain Git objects');
  assert.equal(checkout.with.ref, '${{ github.event.pull_request.base.sha }}');
  const producer = namedStep(gemini, 'Review with Gemini and emit the masked report projection');
  assert.ok(!producer.env.OPENAI_API_KEY && !JSON.stringify(gemini).includes('codex-action'));
  assert.equal(producer.env.GATEKEEPER_WORKFLOW_SHA, '${{ job.workflow_sha }}');
  assert.equal(producer.env.CALLER_SCHEMA_PATH, '${{ inputs.schema-path }}');
  assert.equal(producer.env.CALLER_VALIDATION_PATH, '${{ inputs.validation-path }}');
  const publish = namedStep(report, 'Publish human-readable result');
  assert.equal(publish.env.REVIEW_RESULT, "${{ needs[needs.policy.outputs.provider == 'gemini' && 'gemini-review' || 'review'].result }}");
  assert.equal(publish.env.REPORT_EXPECTED_NONCE, "${{ needs['gemini-review'].outputs.projection_nonce }}");
  assert.match(publish.env.REPORT_PROJECTION_PATH, /needs\.policy\.outputs\.provider == 'gemini'/);
  assert.ok(!Object.hasOwn(gemini.outputs, 'final_message'));
  const guard = namedStep(policy, 'Reject unwired reviewer providers');
  for (const [provider, status] of [['codex', 0], ['gemini', 0], ['attacker', 1]]) {
    const result = spawnSync('bash', ['-e', '-c', guard.run], { env: { ...process.env, SELECTED_PROVIDER: provider } });
    assert.equal(result.status, status);
  }
}

test('protected provider dispatch retains isolated credentials, exact report handoff and no fallback', () => {
  for (const workflow of workflows) verifyProviderBoundary(workflow);
});

test('moving PR-write into Gemini or selecting the successful job violates dispatch isolation', () => {
  for (const workflow of workflows) {
    const widened = structuredClone(workflow);
    widened.jobs['gemini-review'].permissions['pull-requests'] = 'write';
    assert.throws(() => verifyProviderBoundary(widened));
    const fallback = structuredClone(workflow);
    namedStep(fallback.jobs.report, 'Publish human-readable result').env.REVIEW_RESULT = '${{ needs.review.result || needs.gemini-review.result }}';
    assert.throws(() => verifyProviderBoundary(fallback));
  }
});

test('existing Codex-only consumer does not acquire WIF or job-log permissions', () => {
  const consumer = readWorkflow('../../.github/workflows/architecture-gate-consumer.yml').workflow;
  assert.equal(consumer.jobs['gemini-review'], undefined);
  for (const job of Object.values(consumer.jobs)) {
    assert.equal(job.permissions['id-token'], undefined);
    assert.equal(job.permissions.actions, undefined);
  }
  assert.equal(consumer.on.workflow_call.secrets.GCP_WIF_PROVIDER, undefined);
});
