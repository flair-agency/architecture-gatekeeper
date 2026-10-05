import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

for (const file of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
  test(`${file} binds observation to exact ordinary Action inputs and preserves validators`, () => {
    const text = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    const block = text.split('      - name: Record ordinary execution observation\n')[1]?.split('      - name:')[0];
    assert.ok(block);
    assert.match(block, /if: always\(\) && !cancelled\(\) && needs\.policy\.outputs\.execution_selection == 'policy' && steps\.validation_runtime\.outcome == 'success'/);
    for (const [name, expression] of Object.entries({
      REVIEW_PROVIDER: 'needs.policy.outputs.provider',
      REVIEW_MODEL: 'needs.policy.outputs.model',
      REVIEW_SETTINGS_BASE64: 'needs.policy.outputs.execution_settings_base64',
      REVIEW_OUTCOME: 'steps.codex.outcome',
      REVIEW_RESPONSE: 'steps.codex.outputs.final-message',
    })) assert.ok(block.includes(`${name}: \${{ ${expression} }}`));
    assert.match(text, /execution_settings_base64: \$\{\{ steps\.resolve\.outputs\.executionSettingsBase64 \}\}/);
    assert.match(block, /run: node \.architecture-gatekeeper-validation-runtime\/src\/ci-execution-observation\.mjs --github-response/);
    const checkout = text.split('name: Check out the pinned validation runtime')[1]?.split('      - name:')[0];
    assert.match(checkout, /id: validation_runtime/);
    assert.match(checkout, /execution_selection == 'policy'/);
    assert.match(checkout, /ref: \$\{\{ job\.workflow_sha \}\}/);
    const actionPosition = text.indexOf('id: codex\n');
    const observationPosition = text.indexOf('name: Record ordinary execution observation');
    const validationPosition = text.indexOf('name: Identify the completed ordinary decision');
    assert.ok(actionPosition < observationPosition && observationPosition < validationPosition);
    assert.ok(text.includes("DECISION: ${{ (needs.policy.outputs.execution_selection != 'policy' && steps.codex.outputs.final-message) || steps.execution.outputs.final_message }}"));
    assert.doesNotMatch(block, /printf|>>|final_message:|continue-on-error/);
  });
}

function evaluateObserverCondition(expression, { cancelled, selection, checkoutOutcome }) {
  return expression.split(/\s*&&\s*/).every((term) => {
    if (term === 'always()') return true;
    if (term === '!cancelled()') return !cancelled;
    if (term === "needs.policy.outputs.execution_selection == 'policy'") return selection === 'policy';
    if (term === "steps.validation_runtime.outcome == 'success'") return checkoutOutcome === 'success';
    throw new Error(`Unexpected observer condition term: ${term}`);
  });
}

test('candidate-path observer cannot execute unless the pinned runtime checkout succeeded', () => {
  for (const file of ['architecture-gate.yml', 'architecture-gate-consumer.yml']) {
    const text = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    const block = text.split('      - name: Record ordinary execution observation\n')[1]?.split('      - name:')[0];
    const expression = block?.match(/^        if: (.+)$/m)?.[1];
    assert.ok(expression);

    const temp = mkdtempSync(join(tmpdir(), 'agk-runtime-checkout-'));
    try {
      const candidateScript = join(temp, '.architecture-gatekeeper-validation-runtime', 'src', 'ci-execution-observation.mjs');
      mkdirSync(join(temp, '.architecture-gatekeeper-validation-runtime', 'src'), { recursive: true });
      const marker = join(temp, 'executed');
      writeFileSync(candidateScript, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'ran');\n`);
      const invokeWhenEnabled = (state) => {
        if (evaluateObserverCondition(expression, state)) {
          execFileSync(process.execPath, [candidateScript]);
        }
      };

      for (const outcome of ['failure', 'skipped']) {
        invokeWhenEnabled({ cancelled: false, selection: 'policy', checkoutOutcome: outcome });
        assert.equal(existsSync(marker), false, `${file}: candidate script ran after checkout ${outcome}`);
      }
      invokeWhenEnabled({ cancelled: true, selection: 'policy', checkoutOutcome: 'success' });
      assert.equal(existsSync(marker), false, `${file}: candidate script ran after cancellation`);
      invokeWhenEnabled({ cancelled: false, selection: 'policy', checkoutOutcome: 'success' });
      assert.equal(existsSync(marker), true, `${file}: successful pinned checkout did not enable observer`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});

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

test('self protected review binds the exact PR task context before Codex consumes it', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const context = workflow.split('      - name: Attach exact pull request task context to protected review\n')[1]?.split('      - name:')[0];
  assert.ok(context);
  assert.match(context, /if: needs\.policy\.outputs\.authority_manifest_path != '' \|\| needs\.policy\.outputs\.policy_version == '1'/);
  for (const [name, expression] of Object.entries({
    BASE_SHA: 'github.event.pull_request.base.sha',
    HEAD_SHA: 'github.event.pull_request.head.sha',
    REVIEWED_SHA: 'steps.revision.outputs.sha',
    AUTHORITY_LIMITS_BASE64: 'needs.policy.outputs.authority_limits_base64',
    AUTHORITY_PROFILE: 'needs.policy.outputs.authority_profile || \'v1\'',
    POLICY_VERSION: 'needs.policy.outputs.policy_version',
  })) assert.ok(context.includes(`${name}: \${{ ${expression} }}`));
  assert.match(context, /run: node \.architecture-gatekeeper-validation-runtime\/src\/prepare-review-context\.mjs/);
  assert.match(workflow, /preflight-authority-set-review\.mjs \\\s*"\$RUNNER_TEMP\/architecture-gate-decision\.schema\.json" \\\s*"\$RUNNER_TEMP\/architecture-gate-review-prompt\.md"/);
  assert.match(workflow, /prompt-file: \$\{\{ needs\.policy\.outputs\.policy_version == '1' && format\('\{0\}\/architecture-gate-review-prompt\.md', runner\.temp\) \|\| needs\.policy\.outputs\.authority_manifest_path != '' && format\('\{0\}\/architecture-gate-review-prompt\.md', runner\.temp\)/);
  assert.match(workflow, /prompt-file:[\s\S]*?inputs\.protected-review-instructions && format\('\{0\}\/architecture-gate-prompt\.md', runner\.temp\) \|\| inputs\.prompt-path/);
  assert.ok(workflow.indexOf('name: Attach exact pull request task context to protected review') < workflow.indexOf('id: codex\n'));
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
