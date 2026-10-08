import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

test('ordinary execution handoff failures reach report and deny both acceptance routes offline', t => {
  // These are local subprocesses with injected host observations. They do not run
  // GitHub Actions or establish the host's real step/job outcome semantics.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const observer = fileURLToPath(new URL('../src/ci-execution-observation.mjs', import.meta.url));
  const reporter = fileURLToPath(new URL('../src/ci-report.mjs', import.meta.url));
  const enforced = fileURLToPath(new URL('../src/ci-enforced-acceptance.mjs', import.meta.url));
  const procedural = fileURLToPath(new URL('../src/ci-procedural-acceptance.mjs', import.meta.url));
  const workflowMappings = [
    '.github/workflows/architecture-gate.yml',
    '.github/workflows/architecture-gate-consumer.yml',
  ];
  for (const file of workflowMappings) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const observe = text.split('      - name: Record ordinary execution observation\n')[1]?.split('      - name:')[0];
    assert.ok(observe, file);
    assert.match(observe, /run: node \.architecture-gatekeeper-validation-runtime\/src\/ci-execution-observation\.mjs --github-response/);
    assert.doesNotMatch(observe, /continue-on-error/);
    assert.match(text, /final_message: \$\{\{ \(needs\.policy\.outputs\.execution_selection != 'policy' && steps\.codex\.outputs\.final-message\) \|\| steps\.execution\.outputs\.final_message \}\}/);
    const reportJob = text.match(/  report:\n([\s\S]*?)\n  accept:/)?.[1];
    const acceptJob = text.match(/  accept:\n([\s\S]*)$/)?.[1];
    assert.ok(reportJob, file);
    assert.ok(acceptJob, file);
    assert.match(reportJob, /REVIEW_RESULT: \$\{\{ needs\.review\.result \}\}/);
    assert.match(reportJob, /DECISION: \$\{\{ needs\.review\.outputs\.final_message \}\}/);
    assert.match(acceptJob, /REVIEW_RESULT: \$\{\{ needs\.review\.result \}\}/);
    assert.match(acceptJob, /CONCLUSION: \$\{\{ needs\.report\.outputs\.conclusion \}\}/);
  }

  const temp = mkdtempSync(join(tmpdir(), 'agk-failed-handoff-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const baseEnv = { PATH: process.env.PATH };
  let serial = 0;
  const nextFiles = label => {
    const dir = join(temp, `${label}-${serial++}`);
    mkdirSync(dir);
    const output = join(dir, 'github-output');
    writeFileSync(output, '');
    return { dir, output };
  };
  const invokeObserver = (outcome, response) => {
    const files = nextFiles('observer');
    const result = spawnSync(process.execPath, [observer, '--github-response'], {
      cwd: files.dir,
      env: { ...baseEnv, RUNNER_TEMP: files.dir, GITHUB_OUTPUT: realpathSync(files.output),
        REVIEW_PROVIDER: 'codex', REVIEW_MODEL: 'gpt-6.1-sol',
        REVIEW_SETTINGS_BASE64: Buffer.from(JSON.stringify({ reasoningEffort: 'medium' })).toString('base64'),
        REVIEW_OUTCOME: outcome, REVIEW_RESPONSE: response },
      encoding: 'utf8', input: '',
      timeout: 10_000,
    });
    assert.equal(result.error, undefined, result.stderr);
    assert.equal(result.status, outcome === 'success' && response ? 0 : 1, result.stderr);
    const output = readFileSync(files.output, 'utf8');
    const match = output.match(/^final_message<<([^\n]+)\n([\s\S]*?)\n\1\n/m);
    return { result, output, decision: match?.[2] ?? '' };
  };
  const invokeReport = (label, { reviewResult, decision }) => {
    const files = nextFiles(`report-${label}`);
    const result = spawnSync(process.execPath, [reporter], {
      cwd: root,
      env: { ...baseEnv, GITHUB_OUTPUT: files.output,
        REPORT_PATH: join(files.dir, 'report.md'), GITHUB_STEP_SUMMARY: join(files.dir, 'summary.md'),
        GITHUB_API_URL: 'https://example.invalid',
        MODE: 'enforced', POLICY_RESULT: 'success', REVIEW_RESULT: reviewResult,
        DECISION: decision, OWNER_ADDITION_SELECTED: 'true', OWNER_ADDITION_RESULT: 'success',
        OWNER_ADDITION_ELIGIBILITY: 'ELIGIBLE' },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const report = readFileSync(join(files.dir, 'report.md'), 'utf8');
    const reportOutputs = readFileSync(files.output, 'utf8');
    assert.match(reportOutputs, /^conclusion=ERROR$/m);
    const conclusion = reportOutputs.match(/^conclusion=(.+)$/m)?.[1];
    assert.equal(conclusion, 'ERROR');
    assert.doesNotMatch(`${result.stdout}${result.stderr}${report}${reportOutputs}`, /SYNTHETIC_RAW_MARKER/);
    return { report, conclusion };
  };
  const deny = (acceptCli, { reviewResult, conclusion }) => {
    const result = spawnSync(process.execPath, [acceptCli], {
      cwd: root,
      env: { ...baseEnv, REVIEW_RESULT: reviewResult, CONCLUSION: conclusion,
        OWNER_ADDITION_SELECTED: 'G0', OWNER_ADDITION_RESULT: 'success', OWNER_ADDITION_ELIGIBILITY: 'ELIGIBLE',
        POLICY_VERSION: '5', EVIDENCE_PRODUCER: 'github-actions', SELECTED_AUTHORITY_CHANGED: 'true' },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    if (reviewResult !== 'success') {
      assert.match(result.stderr, acceptCli === enforced
        ? /protected review did not complete successfully/i
        : /requires its selected policy, producer and completed review/i);
    } else if (acceptCli === enforced) {
      assert.match(result.stderr, /requires model-backed PASS or verified selected G0 eligibility/i);
    } else {
      assert.match(result.stderr, /selected authority requires successful OWNER_ADDITION/i);
    }
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /SYNTHETIC_RAW_MARKER/);
  };

  const stalePass = '{"decision":"PASS","summary":"SYNTHETIC_RAW_MARKER"}';
  for (const outcome of ['failure', 'cancelled', 'skipped']) {
    const observed = invokeObserver(outcome, stalePass);
    assert.equal(observed.result.status, 1, outcome);
    assert.equal(observed.output, 'execution_status=incomplete\n', `${outcome}: ${observed.result.stdout} ${observed.result.stderr}`);
    assert.equal(observed.decision, '', outcome);
    assert.doesNotMatch(observed.result.stdout, /SYNTHETIC_RAW_MARKER/);
    assert.doesNotMatch(observed.result.stderr, /SYNTHETIC_RAW_MARKER/);
    assert.doesNotMatch(observed.output, /SYNTHETIC_RAW_MARKER/);
    const { report, conclusion } = invokeReport(outcome, { reviewResult: 'failure', decision: observed.decision });
    assert.match(report, /review did not complete successfully/i);
    deny(enforced, { reviewResult: 'failure', conclusion });
    deny(procedural, { reviewResult: 'failure', conclusion });
  }

  const empty = invokeObserver('success', '');
  assert.equal(empty.result.status, 1);
  assert.equal(empty.output, 'execution_status=incomplete\n');
  assert.equal(empty.decision, '');
  const emptyReport = invokeReport('empty-response', { reviewResult: 'failure', decision: empty.decision });
  deny(enforced, { reviewResult: 'failure', conclusion: emptyReport.conclusion });
  deny(procedural, { reviewResult: 'failure', conclusion: emptyReport.conclusion });

  const completedButSuppressed = invokeObserver('success', stalePass);
  assert.equal(completedButSuppressed.result.status, 0);
  assert.match(completedButSuppressed.output, /execution_status=completed/);
  // The empty downstream input is manually injected here; actual runner
  // suppression behavior is exercised by the separate #432 fixture.
  const suppressedReport = invokeReport('suppressed-output', { reviewResult: 'success', decision: '' });
  assert.match(suppressedReport.report, /reporting input was absent/i);
  deny(enforced, { reviewResult: 'success', conclusion: suppressedReport.conclusion });
  deny(procedural, { reviewResult: 'success', conclusion: suppressedReport.conclusion });

  const malformed = invokeObserver('success', 'malformed synthetic response');
  assert.equal(malformed.result.status, 0);
  assert.equal(malformed.decision, 'malformed synthetic response');
  const malformedReport = invokeReport('malformed', { reviewResult: 'success', decision: malformed.decision });
  assert.match(malformedReport.report, /invalid structured decision/i);
  assert.doesNotMatch(`${malformedReport.report}`, /malformed synthetic response/);
  deny(enforced, { reviewResult: 'success', conclusion: malformedReport.conclusion });
  deny(procedural, { reviewResult: 'success', conclusion: malformedReport.conclusion });
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
