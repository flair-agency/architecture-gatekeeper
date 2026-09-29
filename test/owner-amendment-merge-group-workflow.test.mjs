import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('merge_group verifier runs only protected-base code with read-only GitHub permissions', () => {
  const workflow = readFileSync(new URL('../.github/workflows/owner-amendment-merge-group-accept.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^name: Architecture Gate \/ OWNER_AMENDMENT merge_group/m);
  assert.match(workflow, /merge_group:\n    types: \[checks_requested\]/);
  assert.match(workflow, /if: github\.repository == 'flair-agency\/architecture-gatekeeper' && github\.event\.merge_group\.base_ref == 'refs\/heads\/main'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.merge_group\.base_sha \}\}/);
  assert.match(workflow, /event_dir="\$RUNNER_TEMP\/owner-amendment-merge-group"/);
  assert.match(workflow, /cp "\$GITHUB_EVENT_PATH" "\$event_dir\/event\.json"/);
  assert.match(workflow, /GATEKEEPER_RUNTIME_SHA: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(workflow, /OWNER_AMENDMENT_TAG_RULESET_ID: \$\{\{ vars\.OWNER_AMENDMENT_TAG_RULESET_ID \}\}/);
  assert.match(workflow, /working-directory: \$\{\{ runner\.temp \}\}/);
  assert.match(workflow, /node "\$GITHUB_WORKSPACE\/scripts\/owner-amendment-merge-group-gate\.mjs"/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|secrets\./);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.merge_group\.head_sha \}\}/);
  assert.match(workflow, /contents: read[\s\S]*pull-requests: read[\s\S]*actions: read[\s\S]*attestations: read/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|id-token: write/);
});

test('merge_group success is pre-transition verification and keeps adoption/canonical placement pending', () => {
  const verifier = readFileSync(new URL('../src/owner-amendment-merge-group-acceptance.mjs', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../scripts/owner-amendment-merge-group-gate.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /status: 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION'/);
  assert.doesNotMatch(verifier, /status: 'ACCEPTED_OWNER_AMENDMENT_G0'/);
  assert.match(script, /pre-transition eligibility verified; adoption and canonical placement remain pending/);
  assert.doesNotMatch(script, /OWNER_AMENDMENT \/ G0 accepted:/);
});

test('missing-tag no-op checks for successful exact-B semantic signer evidence first', () => {
  const script = readFileSync(new URL('../scripts/owner-amendment-merge-group-gate.mjs', import.meta.url), 'utf8');
  const attempts = readFileSync(new URL('../src/owner-amendment-semantic-producer-attempts.mjs', import.meta.url), 'utf8');
  assert.match(script, /inspectOwnerAmendmentSemanticProducerAttempts/);
  assert.match(script, /searchParams\.set\('page', String\(page\)\)/);
  assert.match(script, /const readJobs = async \(\{ runId, runAttempt, page, perPage \}\)/);
  assert.match(script, /jobsUrl\.searchParams\.set\('per_page', String\(perPage\)\)/);
  assert.match(script, /jobsUrl\.searchParams\.set\('page', String\(page\)\)/);
  assert.match(script, /return \{ total_count: result\.total_count, jobs: result\.jobs \}/);
  assert.match(attempts, /runAttempt: String\(runAttempt\)/);
  assert.match(script, /hasSuccessfulSignerBeforeQueue/);
  assert.match(script, /successful pre-queue semantic eligibility signer result but no protected amendment tag/);
  assert.match(script, /OWNER_AMENDMENT_NOT_APPLICABLE: exact B has no protected amendment tag/);
});
