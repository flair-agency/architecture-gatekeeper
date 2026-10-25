import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWorkflow, namedStep } from './helpers/workflow-structure.mjs';

const wf = parseWorkflow(readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8'));

test('ordinary PASS publication follows all validators without producer credentials', () => {
  const review = wf.jobs.review;
  const publish = namedStep(review, 'Publish validated ordinary Codex PASS display');
  assert.match(publish.if, /steps.decision.outputs.kind == 'PASS'/);
  assert.match(publish.if, /mode == 'enforced'/);
  assert.match(publish.if, /inputs.protected-review-instructions/);
  assert.match(publish.if, /pull_request_target/);
  assert.match(publish.if, /base.ref == 'main'/);
  assert.equal(publish['working-directory'], '${{ runner.temp }}');
  assert.equal(review.steps.at(-1), publish);
  assert.ok(review.steps.indexOf(namedStep(review, 'Apply consumer-owned decision validation')) < review.steps.indexOf(publish));
  assert.ok(review.steps.indexOf(namedStep(review, 'Require exact reported Authority IDs')) < review.steps.indexOf(publish));
  assert.deepEqual(review.permissions, { contents: 'read' });
  assert.equal(publish.env.REVIEW_RESULT, '${{ steps.codex.outcome }}');
  assert.equal(publish.env.AUTHORITY_ROUTE_SELECTED, '${{ needs.policy.outputs.authority_manifest_path != \'\' }}');
  assert.equal(review.outputs.final_message, '${{ steps.pass-display.outputs.pass_conclusion != \'PASS\' && ((needs.policy.outputs.execution_selection != \'policy\' && steps.codex.outputs.final-message) || steps.execution.outputs.final_message) || \'\' }}');
  assert.equal(review.outputs.decision_kind, '${{ steps.decision.outputs.kind }}');
});

test('report and acceptance preserve OWNER_ADDITION and ordinary review outcomes', () => {
  const report = wf.jobs.report;
  assert.deepEqual(report.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'write' });
  const publish = namedStep(report, 'Publish human-readable result');
  assert.equal(publish.env.CODEX_PASS_CONCLUSION, '${{ needs.review.outputs.pass_conclusion }}');
  assert.equal(publish.env.CODEX_PASS_NONCE, '${{ needs.review.outputs.pass_nonce }}');
  assert.equal(publish.env.CODEX_PASS_DIGEST, '${{ needs.review.outputs.pass_digest }}');
  assert.match(publish.env.CODEX_PASS_SELECTED, /needs.review.outputs.decision_kind == 'PASS'/);
  assert.equal(publish.env.OWNER_ADDITION_SELECTED, "${{ needs.policy.outputs.owner_addition_grade == 'G0' }}");
  assert.equal(namedStep(wf.jobs['owner-addition'], 'Verify the exact G0 procedure and prepare protected eligibility input').env.ORDINARY_DECISION,
    '${{ needs.review.outputs.final_message }}');

  const acceptance = namedStep(wf.jobs.accept, 'Require ordinary PASS or the selected verified Owner procedure');
  assert.equal(acceptance.run, 'node .architecture-gatekeeper-runtime/dist/ci-enforced-acceptance.mjs');
  assert.equal(acceptance.env.OWNER_ADDITION_RESULT, "${{ needs['owner-addition'].result }}");
  assert.equal(acceptance.env.OWNER_AMENDMENT_RESULT, "${{ needs['owner-amendment'].result }}");
  assert.equal(acceptance.env.OWNER_AMENDMENT_VERIFICATION, '${{ steps.verify-amendment.outcome }}');
  assert.ok(wf.jobs.accept.steps.indexOf(namedStep(wf.jobs.accept, 'Verify amendment decision and current PR context')) <
    wf.jobs.accept.steps.indexOf(acceptance));
  assert.ok(wf.jobs.accept.steps.some(step => step.name === 'Require PASS or pre-merge G0 eligibility'));
});
