import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

export function parseWorkflow(source, label = 'workflow') {
  const document = parseDocument(source, { version: '1.2', uniqueKeys: true, maxAliasCount: 100 });
  assert.deepEqual(document.errors, [], `${label} must be valid YAML without duplicate keys`);
  return document.toJS({ maxAliasCount: 100 });
}

export function readWorkflow(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return { source, workflow: parseWorkflow(source, relativePath) };
}

export function job(workflow, name) {
  assert.ok(workflow.jobs?.[name], `missing parsed job ${name}`);
  return workflow.jobs[name];
}

export function namedStep(workflowJob, name) {
  const step = workflowJob.steps?.find(candidate => candidate.name === name);
  assert.ok(step, `missing parsed step ${name}`);
  return step;
}

export function hasNeeds(workflowJob, dependency) {
  const needs = Array.isArray(workflowJob.needs) ? workflowJob.needs : [workflowJob.needs].filter(Boolean);
  return needs.includes(dependency);
}

const PROVIDER_GUARD_SCRIPT = `if test -n "$SELECTED_PROVIDER" && test "$SELECTED_PROVIDER" != codex; then
  echo 'Selected reviewer provider is not wired into this workflow; review is incomplete.' >&2
  exit 1
fi`;
const CONSUMER_AMENDMENT_GUARD_SCRIPT = `if test -n "$OWNER_AMENDMENT_ACCEPTANCE"; then
  echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2
  exit 1
fi`;

export function assertWorkflowStructure({ consumer, self, caller, providers }) {
  const consumerPolicy = job(consumer, 'policy');
  const consumerReview = job(consumer, 'review');
  const consumerAddition = job(consumer, 'owner-addition');
  const consumerReport = job(consumer, 'report');
  const consumerAccept = job(consumer, 'accept');
  const providersPolicy = job(providers, 'policy');
  const selfPolicy = job(self, 'policy');
  const selfReview = job(self, 'review');
  const selfAddition = job(self, 'owner-addition');
  const selfAmendment = job(self, 'owner-amendment');
  const selfAccept = job(self, 'accept');
  const consumerPolicyGuard = namedStep(consumerPolicy, 'Reject unwired reviewer providers');
  const selfPolicyGuard = namedStep(selfPolicy, 'Reject unwired reviewer providers');
  for (const [guard, expected] of [[consumerPolicyGuard, PROVIDER_GUARD_SCRIPT], [selfPolicyGuard, PROVIDER_GUARD_SCRIPT.replace('!= codex; then', '!= codex && test \"$SELECTED_PROVIDER\" != gemini; then')]]) {
    assert.equal(guard.env.SELECTED_PROVIDER, '${{ steps.resolve.outputs.provider }}');
    assert.equal(guard.run.trim(), expected, 'provider guard must retain its selected-provider condition and failure behavior');
  }
  assert.equal(consumerPolicyGuard.if, undefined, 'consumer provider guard must always run');
  assert.equal(selfPolicyGuard.if, undefined, 'self provider guard must always run');
  assert.ok(consumerPolicy.steps.indexOf(namedStep(consumerPolicy, 'Resolve policy from protected base revision')) < consumerPolicy.steps.indexOf(consumerPolicyGuard), 'consumer provider guard must follow policy resolution');
  assert.ok(selfPolicy.steps.indexOf(namedStep(selfPolicy, 'Resolve policy from protected base revision')) < selfPolicy.steps.indexOf(selfPolicyGuard), 'self provider guard must follow policy resolution');
  assert.ok(!('id-token' in (consumer.permissions ?? {})) && !('attestations' in (consumer.permissions ?? {})), 'consumer workflow-level permissions must not grant signer capabilities');
  for (const [name, consumerJob] of Object.entries(consumer.jobs)) {
    assert.ok(consumerJob.permissions, `consumer job ${name} must override inherited caller permissions`);
  }

  assert.deepEqual(consumerPolicy.permissions, { contents: 'read' }, 'consumer policy permissions');
  assert.deepEqual(consumerReview.permissions, { contents: 'read' }, 'consumer review permissions');
  assert.deepEqual(consumerAddition.permissions, { contents: 'read' }, 'consumer owner-addition permissions');
  assert.ok(!('id-token' in consumerPolicy.permissions) && !('attestations' in consumerPolicy.permissions));
  assert.ok(!('id-token' in consumerReview.permissions) && !('attestations' in consumerReview.permissions));
  assert.ok(!('id-token' in consumerAddition.permissions) && !('attestations' in consumerAddition.permissions));
  for (const [name, consumerJob] of Object.entries(consumer.jobs)) {
    assert.ok(!('id-token' in (consumerJob.permissions ?? {})), `consumer job ${name} must not receive OIDC permission`);
    assert.ok(!('attestations' in (consumerJob.permissions ?? {})), `consumer job ${name} must not receive attestation permission`);
  }

  assert.deepEqual(selfPolicy.permissions, { contents: 'read' }, 'self policy permissions');
  assert.deepEqual(selfReview.permissions, { contents: 'read' }, 'self review permissions');
  assert.deepEqual(selfAmendment.permissions, { contents: 'read' }, 'self amendment reviewer is read-only');
  for (const name of ['block-review-record', 'owner-amendment-owner-decision-record',
    'owner-amendment-attempt-classifier', 'owner-amendment-semantic-eligibility',
    'owner-amendment-semantic-eligibility-signer', 'self-app-start', 'self-app-report']) {
    assert.ok(!(name in consumer.jobs), `self-only job ${name} must be absent from consumer workflow`);
    for (const [consumerJobName, consumerJob] of Object.entries(consumer.jobs)) {
      assert.ok(!hasNeeds(consumerJob, name), `consumer job ${consumerJobName} must not depend on self-only ${name}`);
    }
  }
  const consumerAmendmentGuard = namedStep(consumerPolicy, 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow');
  assert.equal(consumerAmendmentGuard.if, undefined, 'consumer OWNER_AMENDMENT guard must always run');
  assert.equal(consumerAmendmentGuard.env.OWNER_AMENDMENT_ACCEPTANCE, '${{ steps.resolve.outputs.ownerAmendmentAcceptance }}');
  assert.equal(consumerAmendmentGuard.run.trim(), CONSUMER_AMENDMENT_GUARD_SCRIPT, 'consumer amendment guard must reject the self-only selection');
  const providersAmendmentGuard = namedStep(providersPolicy, 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow');
  assert.equal(providersAmendmentGuard.if, undefined, 'provider-workflow OWNER_AMENDMENT guard must always run');
  assert.equal(providersAmendmentGuard.env.OWNER_AMENDMENT_ACCEPTANCE, '${{ steps.resolve.outputs.ownerAmendmentAcceptance }}');
  assert.equal(providersAmendmentGuard.run.trim(), CONSUMER_AMENDMENT_GUARD_SCRIPT,
    'provider-workflow amendment guard must reject the self-only selection');
  assert.equal(consumerPolicy.outputs.owner_addition_grade, '${{ steps.resolve.outputs.ownerAdditionGrade }}');
  assert.ok(!('self-flex-probe' in (consumer.on.workflow_call.inputs ?? {})), 'consumer workflow must not expose self flex input');
  const consumerStructure = JSON.stringify(consumer);
  for (const selfOnlySetting of ['self-flex-probe', 'ARCHITECTURE_GATE_SELF_FLEX', 'service_tier']) {
    assert.ok(!consumerStructure.includes(selfOnlySetting), `consumer workflow must not contain self-only setting ${selfOnlySetting}`);
  }

  assert.ok(hasNeeds(consumerReview, 'policy'), 'consumer review must depend on policy');
  assert.ok(hasNeeds(consumerAddition, 'policy') && hasNeeds(consumerAddition, 'review'), 'consumer owner-addition must depend on policy and review');
  assert.ok(hasNeeds(consumerReport, 'policy') && hasNeeds(consumerReport, 'review') && hasNeeds(consumerReport, 'owner-addition'), 'consumer report must depend on policy, review, and owner-addition');
  assert.ok(hasNeeds(consumerAccept, 'policy') && hasNeeds(consumerAccept, 'review') && hasNeeds(consumerAccept, 'owner-addition') && hasNeeds(consumerAccept, 'report'), 'consumer accept must depend on policy, review, owner-addition, and report');
  assert.ok(hasNeeds(job(self, 'review'), 'policy'), 'self review must depend on policy');
  assert.ok(hasNeeds(selfAddition, 'policy') && hasNeeds(selfAddition, 'review'), 'self owner-addition must depend on policy and review');
  assert.deepEqual(selfAmendment.needs, ['policy', 'review', 'owner-addition'], 'one amendment job follows policy, ordinary review, and optional addition');
  assert.match(selfAmendment.if, /^always\(\) &&/);
  assert.match(selfAmendment.if, /needs\['owner-addition'\]\.outputs\.eligibility != 'ELIGIBLE'/,
    'always() must let the amendment route handle a skipped OWNER_ADDITION job');
  assert.match(selfAmendment.if, /needs\.review\.result == 'success'/);
  assert.equal(selfAccept.if, 'always()', 'K acceptance must run after skipped or failed optional routes');
  assert.ok(hasNeeds(selfAccept, 'owner-amendment'), 'K acceptance must depend on same-run amendment eligibility');
  const baseCheckout = namedStep(selfAmendment, 'Check out the adopted base runtime');
  assert.equal(baseCheckout.with.ref, '${{ github.event.pull_request.base.sha }}');
  assert.equal(baseCheckout.with['persist-credentials'], false);
  const prepareAmendment = namedStep(selfAmendment, 'Prepare amendment review from the complete old Authority Set');
  assert.equal(prepareAmendment.env.BASE_SHA, '${{ github.event.pull_request.base.sha }}');
  assert.equal(prepareAmendment.env.REVIEWED_SHA, '${{ needs.review.outputs.reviewed_sha }}');
  assert.match(prepareAmendment.run, /self-amendment-pr\.mjs" prepare/);
  const amendmentModel = namedStep(selfAmendment, 'Review amendment eligibility');
  assert.equal(amendmentModel.uses, 'openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e');
  assert.equal(amendmentModel.with['openai-api-key'], '${{ secrets.OPENAI_API_KEY }}');
  assert.equal(amendmentModel.with.sandbox, 'read-only');
  assert.equal(selfAmendment.steps.filter(step => step !== amendmentModel)
    .some(step => Object.values(step.env ?? {}).some(value => String(value).includes('secrets.OPENAI_API_KEY'))), false,
  'the OpenAI key is confined to the model review step');
  const completeAmendment = namedStep(selfAmendment, 'Validate the decision against the exact same-run inputs');
  assert.equal(completeAmendment.env.DECISION, '${{ steps.codex.outputs.final-message }}');
  assert.match(completeAmendment.run, /self-amendment-pr\.mjs" complete/);
  assert.equal(selfAmendment.outputs.context_sha256, '${{ steps.complete.outputs.context_sha256 }}');
  assert.equal(selfAmendment.outputs.decision_base64, '${{ steps.complete.outputs.decision_base64 }}');
  const verifyAmendment = namedStep(selfAccept, 'Verify amendment decision and current PR context');
  assert.match(verifyAmendment.run, /self-amendment-pr\.mjs" verify/);
  assert.equal(verifyAmendment.env.CONTEXT_SHA256, "${{ needs['owner-amendment'].outputs.context_sha256 }}");
  assert.equal(verifyAmendment.env.DECISION_BASE64, "${{ needs['owner-amendment'].outputs.decision_base64 }}");
  assert.ok(selfAccept.steps.indexOf(verifyAmendment) < selfAccept.steps.findIndex(step => step.name === 'Require ordinary PASS or the selected verified Owner procedure'));
  const selfWorkflowText = JSON.stringify(self);
  for (const retiredPath of ['owner-amendment-attempt-classifier', 'owner-amendment-semantic-eligibility-signer',
    'owner-amendment-block-producer', 'owner-amendment-owner-decision-producer', 'self-app-', 'self-queue-', 'merge_group:']) {
    assert.ok(!selfWorkflowText.includes(retiredPath), `self workflow must not retain retired connector ${retiredPath}`);
  }

  const consumerResolve = namedStep(consumerPolicy, 'Resolve policy from protected base revision');
  const selfResolve = namedStep(selfPolicy, 'Resolve policy from protected base revision');
  assert.deepEqual(consumerResolve, selfResolve, 'consumer and self protected policy resolution must remain aligned');
  assert.match(consumerResolve.run, /git cat-file -e "\$BASE_SHA:\$POLICY_PATH"/);
  assert.match(consumerResolve.run, /materialize-regular-git-snapshot\.mjs/);
  assert.match(consumerResolve.run, /resolve-ci-policy\.mjs/);

  assert.equal(caller.jobs['architecture-gate'].uses, './.github/workflows/architecture-gate.yml', 'self caller reusable workflow source');
  const consumerReviewStep = namedStep(consumerReview, 'Run read-only architecture review');
  const selfReviewStep = namedStep(selfReview, 'Run read-only architecture review');
  assert.equal(consumerReviewStep.uses, 'openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e', 'consumer reviewer action exact pin');
  assert.equal(selfReviewStep.uses, consumerReviewStep.uses, 'self reviewer action exact pin');
  for (const workflowJob of [consumerAddition, selfAddition]) {
    assert.ok(workflowJob.steps.some(step => step.name === 'Verify the exact G0 procedure and prepare protected eligibility input'));
    assert.ok(workflowJob.steps.some(step => step.name === 'Require completed B-specific eligibility review'));
    assert.ok(workflowJob.steps.some(step => step.uses === 'openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e'));
  }
  assert.equal(self.name, 'Architecture Gate', 'self reusable workflow name');
  assert.equal(consumerAddition.environment, undefined, 'consumer owner-addition must not bind self-only environment');
  assert.deepEqual(consumerAddition, selfAddition, 'consumer and self owner-addition behavior remains aligned');
  assert.match(selfAddition.if, /needs\.policy\.outputs\.owner_addition_grade == 'G0'/);
  assert.match(selfAddition.if, /needs\.review\.outputs\.decision_kind == 'OWNER_DECISION'/);
  for (const workflowJob of [consumerAddition, selfAddition]) {
    const evidenceStep = namedStep(workflowJob, 'Preserve exact v5 pre-merge eligibility evidence');
    assert.equal(evidenceStep.if, "needs.policy.outputs.mode == 'procedural' && needs.policy.outputs.adoption_evidence_producer == 'github-actions' && steps.eligibility.outputs.eligibility == 'ELIGIBLE'");
  }
  for (const reviewJob of [consumerReview, selfReview]) {
    const materializeLegacy = namedStep(reviewJob, 'Materialize recorded-base legacy authority before review');
    assert.equal(materializeLegacy.if, "needs.policy.outputs.policy_version == '1'");
    assert.equal(materializeLegacy.env.BASE_SHA, '${{ github.event.pull_request.base.sha }}');
    assert.equal(materializeLegacy.env.AUTHORITY_FILES_BASE64, '${{ needs.policy.outputs.legacy_authority_files_base64 }}');
    assert.equal(materializeLegacy['working-directory'], '${{ runner.temp }}');
    assert.equal(materializeLegacy.run, 'node "$GATEKEEPER_RUNTIME_ROOT/dist/prepare-legacy-ci-authority.mjs" prepare');
    const reportedLegacy = namedStep(reviewJob, 'Require exact reported legacy authority files');
    assert.equal(reportedLegacy.if, "needs.policy.outputs.policy_version == '1'");
    assert.equal(reportedLegacy['working-directory'], '${{ runner.temp }}');
    assert.equal(reportedLegacy.run, 'node "$GATEKEEPER_RUNTIME_ROOT/dist/prepare-legacy-ci-authority.mjs" validate');
    const reportedIds = namedStep(reviewJob, 'Require exact reported Authority IDs');
    assert.equal(reportedIds.if, "needs.policy.outputs.authority_manifest_path != ''");
    assert.match(reportedIds.run, /validate-authority-set-decision\.mjs/);
  }
}
