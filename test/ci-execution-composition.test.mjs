import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

for (const file of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
  test(`${file} binds observation to exact ordinary Action inputs and preserves validators`, () => {
    const text = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    const block = text.split('      - name: Record ordinary execution observation\n')[1]?.split('      - name:')[0];
    assert.ok(block);
    assert.match(block, /if: always\(\) && !cancelled\(\) && needs\.policy\.outputs\.execution_selection == 'policy'/);
    for (const [name, expression] of Object.entries({
      REVIEW_PROVIDER: 'needs.policy.outputs.provider',
      REVIEW_MODEL: 'needs.policy.outputs.model',
      REVIEW_SETTINGS_BASE64: 'needs.policy.outputs.execution_settings_base64',
      REVIEW_OUTCOME: 'steps.codex.outcome',
      REVIEW_RESPONSE: 'steps.codex.outputs.final-message',
    })) assert.ok(block.includes(`${name}: \${{ ${expression} }}`));
    assert.match(text, /execution_settings_base64: \$\{\{ steps\.resolve\.outputs\.executionSettingsBase64 \}\}/);
    assert.match(block, /run: node \.architecture-gatekeeper-validation-runtime\/src\/ci-execution-observation\.mjs --github/);
    const checkout = text.split('name: Check out the pinned validation runtime')[1]?.split('      - name:')[0];
    assert.match(checkout, /execution_selection == 'policy'/);
    assert.match(checkout, /ref: \$\{\{ job\.workflow_sha \}\}/);
    const actionPosition = text.indexOf('id: codex\n');
    const observationPosition = text.indexOf('name: Record ordinary execution observation');
    const validationPosition = text.indexOf('name: Identify the completed ordinary decision');
    assert.ok(actionPosition < observationPosition && observationPosition < validationPosition);
    assert.match(text, /DECISION: \$\{\{ steps\.codex\.outputs\.final-message \}\}/);
    assert.doesNotMatch(block, /printf|>>|final_message:|continue-on-error/);
  });
}

test('self selects existing effective Codex limits without changing governance selection', () => {
  const policy = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/ci-policy.json', import.meta.url), 'utf8'));
  const resolved = resolveCiPolicy(policy, 'main');
  assert.equal(policy.version, 2);
  assert.deepEqual(policy.branches.main.execution, {
    reviewJobTimeoutMinutes: 7, reviewStepTimeoutMinutes: 5, codexProfile: 'standard',
  });
  assert.equal(resolved.executionSelection, 'policy');
  assert.equal(resolved.ownerAmendmentVersion, 1);
  assert.equal(resolved.ownerAmendmentTriggerProfile, 'completed-owner-decision-self-v1');
  assert.equal(resolved.model, 'gpt-6.1-sol');
  assert.equal(resolved.reasoningEffort, 'medium');
});


test('encoded expected settings agree with the same resolved Action configuration', () => {
  const policy = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/ci-policy.json', import.meta.url), 'utf8'));
  for (const codexProfile of ['standard', 'flex']) {
    policy.branches.main.execution.codexProfile = codexProfile;
    const selected = resolveCiPolicy(policy, 'main');
    assert.deepEqual(JSON.parse(Buffer.from(selected.executionSettingsBase64, 'base64').toString('utf8')), {
      reasoningEffort: selected.reasoningEffort,
      codexArgs: JSON.parse(selected.codexArgs),
      reviewJobTimeoutMinutes: selected.reviewJobTimeoutMinutes,
      reviewStepTimeoutMinutes: selected.reviewStepTimeoutMinutes,
    });
  }
});
