import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWorkflow, assertWorkflowStructure } from './helpers/workflow-structure.mjs';
import { stringify } from 'yaml';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = {
  consumer: read('../.github/workflows/architecture-gate-consumer.yml'),
  self: read('../.github/workflows/architecture-gate.yml'),
  caller: read('../.github/workflows/self-architecture-gate.yml'),
};
const workflows = () => Object.fromEntries(Object.entries(source).map(([key, text]) => [key, parseWorkflow(text, key)]));
const valid = () => assertWorkflowStructure(workflows());

test('production workflow files satisfy parsed structural invariants', valid);

test('a comment containing required-looking text cannot satisfy a missing structural guard', () => {
  const data = workflows();
  data.consumer.jobs.policy.steps = data.consumer.jobs.policy.steps.filter(step => step.name !== 'Reject unwired reviewer providers');
  assert.throws(() => assertWorkflowStructure(data), /missing parsed step Reject unwired reviewer providers/);
  const commented = `# Reject unwired reviewer providers: SELECTED_PROVIDER, exit 1, needs: [policy]\n${stringify(data.consumer)}`;
  assert.throws(() => {
    const changed = { ...data, consumer: parseWorkflow(commented, 'comment fixture') };
    assertWorkflowStructure(changed);
  }, /missing parsed step Reject unwired reviewer providers/);
});

test('a permission placed on the wrong job fails the target-job permission invariant', () => {
  const data = workflows();
  data.consumer.jobs.report.permissions['id-token'] = 'write';
  assert.throws(() => assertWorkflowStructure(data), /consumer job report must not receive OIDC permission/);
  data.consumer.jobs.report.permissions['id-token'] = 'none';
  data.consumer.jobs.review.permissions['id-token'] = 'write';
  assert.throws(() => assertWorkflowStructure(data), /consumer review permissions/);
});

test('a dropped needs edge fails the dependent job invariant', () => {
  const data = workflows();
  data.consumer.jobs['owner-addition'].needs = ['policy'];
  assert.throws(() => assertWorkflowStructure(data), /consumer owner-addition must depend on policy and review/);

  const misplacedSelfDependency = workflows();
  misplacedSelfDependency.consumer.jobs.review.needs.push('owner-amendment-semantic-eligibility-signer');
  assert.throws(() => assertWorkflowStructure(misplacedSelfDependency), /consumer job review must not depend on self-only owner-amendment-semantic-eligibility-signer/);
});

test('disconnected legacy assurance steps and broadened route conditions fail their selected invariants', () => {
  const disabledLegacy = workflows();
  disabledLegacy.consumer.jobs.review.steps.find(step => step.name === 'Materialize recorded-base legacy authority before review').if = false;
  assert.throws(() => assertWorkflowStructure(disabledLegacy), /needs\.policy\.outputs\.policy_version/);

  const broadenedRoute = workflows();
  const evidence = broadenedRoute.consumer.jobs['owner-addition'].steps.find(step => step.name === 'Preserve exact v5 pre-merge eligibility evidence');
  evidence.if = evidence.if.replace(' && ', ' || ');
  assert.throws(() => assertWorkflowStructure(broadenedRoute), /Preserve exact v5 pre-merge eligibility evidence/);
});

test('a disconnected provider guard fails even when its step remains elsewhere', () => {
  const data = workflows();
  const [guard] = data.consumer.jobs.policy.steps.splice(data.consumer.jobs.policy.steps.findIndex(step => step.name === 'Reject unwired reviewer providers'), 1);
  data.consumer.jobs.review.steps.push(guard);
  assert.throws(() => assertWorkflowStructure(data), /missing parsed step Reject unwired reviewer providers/);
});

test('a disabled provider guard and inherited workflow-level signer permissions fail closed', () => {
  for (const disabledValue of [false, 'false']) {
    const guardDisabled = workflows();
    guardDisabled.consumer.jobs.policy.steps.find(candidate => candidate.name === 'Reject unwired reviewer providers').if = disabledValue;
    assert.throws(() => assertWorkflowStructure(guardDisabled), /consumer provider guard must always run/);

    const selfGuardDisabled = workflows();
    selfGuardDisabled.self.jobs.policy.steps.find(candidate => candidate.name === 'Reject unwired reviewer providers').if = disabledValue;
    assert.throws(() => assertWorkflowStructure(selfGuardDisabled), /self provider guard must always run/);

    const amendmentGuardDisabled = workflows();
    amendmentGuardDisabled.consumer.jobs.policy.steps.find(candidate => candidate.name === 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow').if = disabledValue;
    assert.throws(() => assertWorkflowStructure(amendmentGuardDisabled), /consumer OWNER_AMENDMENT guard must always run/);
  }

  const broadPermissions = workflows();
  broadPermissions.consumer.permissions = { contents: 'read', 'id-token': 'write', attestations: 'write' };
  assert.throws(() => assertWorkflowStructure(broadPermissions), /consumer workflow-level permissions must not grant signer capabilities/);

  for (const scope of ['workflow', 'job']) {
    const selfFlex = workflows();
    if (scope === 'workflow') selfFlex.consumer.env = { ARCHITECTURE_GATE_SELF_FLEX: 'true' };
    else selfFlex.consumer.jobs.policy.env = { service_tier: 'flex' };
    assert.throws(() => assertWorkflowStructure(selfFlex), /consumer workflow must not contain self-only setting/);
  }
});

test('provider and consumer amendment guards retain the selected condition, not just failure keywords', () => {
  const providerMutations = [
    ['removed condition', `echo 'Selected reviewer provider is not wired into this workflow; review is incomplete.' >&2\nexit 1`],
    ['inverted condition', `if test -n "$SELECTED_PROVIDER" && test "$SELECTED_PROVIDER" = codex; then\n  echo 'Selected reviewer provider is not wired into this workflow; review is incomplete.' >&2\n  exit 1\nfi`],
    ['unconditional fake', `echo 'SELECTED_PROVIDER != codex'\necho 'Selected reviewer provider is not wired'\nexit 1`],
    ['comment only', `# if test -n "$SELECTED_PROVIDER" && test "$SELECTED_PROVIDER" != codex; then\n#   echo 'Selected reviewer provider is not wired into this workflow; review is incomplete.' >&2\n#   exit 1\n# fi`],
  ];
  for (const profile of ['consumer', 'self']) {
    for (const [label, run] of providerMutations) {
      const data = workflows();
      data[profile].jobs.policy.steps.find(step => step.name === 'Reject unwired reviewer providers').run = run;
      assert.throws(() => assertWorkflowStructure(data), /provider guard must retain its selected-provider condition/, `${profile} provider guard accepted ${label}`);
    }
  }

  const amendmentMutations = [
    ['removed condition', `echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\nexit 1`],
    ['inverted condition', `if test "$OWNER_AMENDMENT_GRADE" != G0; then\n  echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\n  exit 1\nfi`],
    ['unconditional fake', `echo 'OWNER_AMENDMENT_GRADE G0'\necho 'OWNER_AMENDMENT is supported only by the protected self workflow'\nexit 1`],
    ['comment only', `# if test "$OWNER_AMENDMENT_GRADE" = G0; then\n#   echo 'OWNER_AMENDMENT is supported only by the protected self workflow.' >&2\n#   exit 1\n# fi`],
  ];
  for (const [label, run] of amendmentMutations) {
    const data = workflows();
    data.consumer.jobs.policy.steps.find(step => step.name === 'Reject self-only OWNER_AMENDMENT policy on the consumer workflow').run = run;
    assert.throws(() => assertWorkflowStructure(data), /consumer amendment guard must retain its G0 condition/, `consumer amendment guard accepted ${label}`);
  }
});

test('comments, formatting, and mapping key order do not alter structural validation', () => {
  const data = workflows();
  const commented = parseWorkflow(`# permissions: id-token: write; needs: [missing]; uses: openai/codex-action@wrong\n${source.consumer}`, 'comment positive fixture');
  assertWorkflowStructure({ ...data, consumer: commented });

  const reordered = Object.fromEntries(Object.entries(data.consumer).reverse());
  const yamlWithReorderedKeysAndFormatting = `# harmless comment\n${stringify(reordered, { indent: 4, lineWidth: 100 })}`;
  assertWorkflowStructure({ ...data, consumer: parseWorkflow(yamlWithReorderedKeysAndFormatting, 'reordered positive fixture') });
});

test('malformed YAML and duplicate mapping keys fail before invariant checks', () => {
  assert.throws(() => parseWorkflow('jobs:\n  policy: {}\n  policy: {}\n', 'duplicate fixture'), /duplicate keys/);
  assert.throws(() => parseWorkflow('jobs: [\n', 'malformed fixture'), /valid YAML/);
});
