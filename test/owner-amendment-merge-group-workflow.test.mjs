import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('candidate wake-up is unprivileged and delegates all verification to the guarded protected receiver', () => {
  const workflow = readFileSync(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^name: Self Architecture Gate/m);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /merge_group:\n    types: \[checks_requested\]\n    branches: \[main\]/);
  assert.match(workflow, /architecture-gate:/);
  assert.match(workflow, /if: github\.event_name == 'pull_request_target' && github\.event\.pull_request\.draft == false/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/architecture-gate\.yml/);
  assert.match(workflow, /merge-group-wakeup:\n    name: merge-group-wakeup[\s\S]*?permissions: \{\}[\s\S]*?run: test "\$GITHUB_EVENT_NAME" = merge_group/);
  const wakeup = workflow.split('\n  merge-group-wakeup:')[1];
  assert.doesNotMatch(wakeup, /secrets\.|OPENAI_API_KEY|actions\/checkout|codex-action@|contents: write|pull-requests: write|checks: write/);
  assert.doesNotMatch(workflow, /architecture-gate \/ accept/);
  const receiver = readFileSync(new URL('../.github/workflows/self-architecture-gate-receiver.yml', import.meta.url), 'utf8');
  const reusableWorkflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const upstreamActionPin = reusableWorkflow.match(/uses: openai\/codex-action@([a-f0-9]{40})/)?.[1];
  assert.match(receiver, /workflow_run:\n    workflows: \[Self Architecture Gate\]\n    types: \[completed\]/);
  assert.doesNotMatch(receiver, /codex-action-integrity|verify-codex-action|flair-agency\/codex-action/);
  assert.match(receiver, /protected-queue-review:\n    if: github\.repository == 'flair-agency\/architecture-gatekeeper'/);
  assert.match(receiver, /protected-queue-reporter:\n    needs: \[protected-queue-review\]/);
  assert.match(receiver, /if: github\.repository == 'flair-agency\/architecture-gatekeeper' && github\.ref == 'refs\/heads\/main' && github\.event\.workflow_run\.event == 'merge_group' && vars\.OWNER_AMENDMENT_RECEIVER_ENABLED == 'true'/);
  assert.match(receiver, /environment:\n      name: architecture-gate-self-protected/);
  assert.match(receiver, /permissions:\n      actions: read\n      attestations: read\n      contents: read\n      pull-requests: read/);
  assert.match(receiver, /Check out only the protected default-branch revision\n        uses: actions\/checkout@[a-f0-9]{40}[\s\S]*?ref: \$\{\{ github\.sha \}\}[\s\S]*?persist-credentials: false/);
  assert.doesNotMatch(receiver, /github\.event\.workflow_run\.head_sha|download-artifact|actions: write|contents: write|pull-requests: write|checks: write/);
  assert.match(receiver, /owner-amendment-workflow-run-receiver\.mjs" resolve/);
  assert.match(receiver, /owner-amendment-merge-group-gate\.mjs/);
  const reviewedActionPin = receiver.match(/uses: openai\/codex-action@([a-f0-9]{40})/);
  assert.equal(reviewedActionPin?.[1], upstreamActionPin,
    'ordinary review action must use the protected reusable workflow pin');
  assert.match(receiver, /Run the fresh read-only ordinary review\n        id: ordinary-review\n        if: steps\.prepare-ordinary\.outcome == 'success'\n        timeout-minutes: 5/);
  assert.match(receiver, /openai-api-key: \$\{\{ secrets\.OPENAI_API_KEY \}\}[\s\S]*?prompt-file: \$\{\{ runner\.temp \}\}\/owner-amendment-merge-group\/ordinary-prompt\.md[\s\S]*?output-schema-file: \$\{\{ runner\.temp \}\}\/owner-amendment-merge-group\/ordinary-schema\.json[\s\S]*?model: \$\{\{ steps\.prepare-ordinary\.outputs\.model \}\}[\s\S]*?effort: \$\{\{ steps\.prepare-ordinary\.outputs\.effort \}\}[\s\S]*?sandbox: read-only[\s\S]*?safety-strategy: drop-sudo/);
  assert.doesNotMatch(receiver, /timeout-seconds:/);
  assert.match(receiver, /owner-amendment-workflow-run-receiver\.mjs" publish/);
  const reviewer = receiver.split('\n  protected-queue-reporter:')[0];
  const reporter = receiver.split('\n  protected-queue-reporter:')[1];
  assert.doesNotMatch(reviewer, /OWNER_AMENDMENT_APP_|checks: write/);
  assert.match(reviewer, /outputs:\n      handoff:/);
  assert.doesNotMatch(reporter, /OPENAI_API_KEY|openai-api-key|codex-action@/);
  assert.match(reporter, /Compare reporter context with original before verification[\s\S]*?Independently reverify/);
  assert.match(reporter, /environment:\n      name: architecture-gate-self-app-report/);
  assert.match(reporter, /VERIFICATION_OUTCOME: \$\{\{ steps\.verify\.outcome \}\}[\s\S]*?ORDINARY_VALIDATION_OUTCOME: \$\{\{ steps\.ordinary-validation\.outcome \}\}/);
  assert.doesNotMatch(reporter, /needs\.protected-queue-review\.result/);
  const publishStep = reporter.split('\n      - name: Publish only reporter-local verification')[1];
  assert.match(publishStep, /if: always\(\) && steps\.resolve\.outcome == 'success'/);
  assert.match(publishStep, /OWNER_AMENDMENT_APP_PRIVATE_KEY: \$\{\{ secrets\.OWNER_AMENDMENT_APP_PRIVATE_KEY \}\}/);
  const beforePublish = reporter.split('\n      - name: Publish only reporter-local verification')[0];
  assert.doesNotMatch(beforePublish, /OWNER_AMENDMENT_APP_(?:PRIVATE_KEY|ID|INSTALLATION_ID)/);
  assert.match(publishStep, /OWNER_AMENDMENT_APP_ID: \$\{\{ vars\.OWNER_AMENDMENT_APP_ID \}\}/);
  assert.match(publishStep, /OWNER_AMENDMENT_APP_INSTALLATION_ID: \$\{\{ vars\.OWNER_AMENDMENT_APP_INSTALLATION_ID \}\}/);
  const script = readFileSync(new URL('../scripts/owner-amendment-merge-group-gate.mjs', import.meta.url), 'utf8');
  assert.match(script, /adaptVerifiedWorkflowRunContext/);
  assert.match(script, /syntheticVerifiedMergeGroupEvent/);
  assert.doesNotMatch(script, /selectOwnerAmendmentMergeGroupBContext/);
  assert.match(script, /git\(\['rev-parse', 'HEAD'\]\)/);
  assert.match(script, /runtimeRevision !== selection\.bBaseSha/);
  assert.match(script, /eligibilityReviewInputs\(/);
  assert.match(script, /prepared-context\.json/);
  assert.match(script, /git\(\['--no-replace-objects', 'diff', '--binary', '--no-ext-diff', '--no-renames'/);
  assert.match(script, /hash\(promptBytes\) !== prepared\.promptSha256 \|\| hash\(schemaBytes\) !== prepared\.schemaSha256 \|\|\s*hash\(diffBytes\) !== prepared\.diffSha256/);
});

test('receiver hands off ordinary decision bytes only after a successful reviewer action', () => {
  const receiver = readFileSync(new URL('../.github/workflows/self-architecture-gate-receiver.yml', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../scripts/owner-amendment-workflow-run-receiver.mjs', import.meta.url), 'utf8');
  const handoffInput = receiver.match(/DECISION: \$\{\{ (.*?) \}\}/)?.[1];
  assert.equal(handoffInput,
    "steps.ordinary-review.outcome == 'success' && steps.ordinary-review.outputs.final-message || ''");

  const javascriptExpression = handoffInput
    .replaceAll('steps.ordinary-review.outcome', 'outcome')
    .replaceAll('steps.ordinary-review.outputs.final-message', 'finalMessage');
  const handoffDecision = new Function('outcome', 'finalMessage', `return (${javascriptExpression});`);
  assert.equal(handoffDecision('failure', '{"decision":"PASS"}'), '',
    'an output left behind by a failed reviewer must not enter the handoff');
  assert.equal(handoffDecision('success', '{"decision":"PASS"}'), '{"decision":"PASS"}',
    'a successful reviewer decision must remain available for validation');
  assert.equal(handoffDecision('skipped', '{"decision":"PASS"}'), '',
    'the ordinary reviewer is skipped on the amendment route');
  assert.match(receiver, /steps\.verify\.outputs\.route == 'ordinary'/);
  assert.match(script, /decision: raw \|\| null/);
  assert.match(script, /process\.stdout\.write\(value\.decision \?\? ''\)/);
});

test('merge_group success is pre-transition verification and keeps adoption/canonical placement pending', () => {
  const verifier = readFileSync(new URL('../src/owner-amendment-merge-group-acceptance.mjs', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../scripts/owner-amendment-merge-group-gate.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /status: 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION'/);
  assert.doesNotMatch(verifier, /status: 'ACCEPTED_OWNER_AMENDMENT_G0'/);
  assert.match(script, /pre-transition eligibility verified; adoption and canonical placement remain pending/);
  assert.doesNotMatch(script, /OWNER_AMENDMENT \/ G0 accepted:/);
});

test('missing-tag merge-group route selects fresh exact-tuple ordinary PASS verification', () => {
  const script = readFileSync(new URL('../scripts/owner-amendment-merge-group-gate.mjs', import.meta.url), 'utf8');
  const attempts = readFileSync(new URL('../src/owner-amendment-semantic-producer-attempts.mjs', import.meta.url), 'utf8');
  assert.match(script, /inspectOwnerAmendmentSemanticProducerAttempts/);
  assert.match(script, /searchParams\.set\('head_sha', bBaseSha\)/);
  assert.match(script, /searchParams\.set\('created', `\$\{createdFrom\}\.\.\$\{createdTo\}`\)/);
  assert.match(script, /searchParams\.set\('page', String\(page\)\)/);
  assert.match(script, /const readJobs = async \(\{ runId, runAttempt, page, perPage \}\)/);
  assert.match(script, /jobsUrl\.searchParams\.set\('per_page', String\(perPage\)\)/);
  assert.match(script, /jobsUrl\.searchParams\.set\('page', String\(page\)\)/);
  assert.match(script, /return \{ total_count: result\.total_count, jobs: result\.jobs \}/);
  assert.match(attempts, /runAttempt: String\(runAttempt\)/);
  assert.match(script, /if \(tagResponse === null\) assertMissingOwnerAmendmentTagHasNoSuccessfulSigner\(producerAttempts\)/);
  assert.match(attempts, /hasSuccessfulSignerBeforeQueue/);
  assert.match(attempts, /hasAmbiguousSuccessfulSignerBeforeQueue/);
  assert.match(attempts, /successful pre-queue semantic eligibility signer result but no protected amendment tag/);
  assert.match(script, /selectRoute\('ordinary', selection\)/);
  assert.match(script, /fresh ordinary review of the exact current base\/B tuple/);
  const ordinary = readFileSync(new URL('../src/owner-amendment-merge-group-ordinary-review.mjs', import.meta.url), 'utf8');
  assert.match(ordinary, /prepareOwnerAmendmentMergeGroupOrdinaryReview/);
  assert.match(ordinary, /validateOwnerAmendmentMergeGroupOrdinaryDecision/);
  assert.match(ordinary, /decision\.decision !== 'PASS'/);
});
