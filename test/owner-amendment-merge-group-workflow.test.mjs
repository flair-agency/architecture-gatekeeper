import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('merge-group amendment verifier remains inactive in the self workflow', () => {
  const workflow = readFileSync(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^name: Self Architecture Gate/m);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /branches: \[main\]/);
  assert.doesNotMatch(workflow, /^  merge_group:/m);
  assert.match(workflow, /architecture-gate:/);
  assert.match(workflow, /if: github\.event_name == 'pull_request_target' && github\.event\.pull_request\.draft == false/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/architecture-gate\.yml/);
  assert.doesNotMatch(workflow, /merge-group-(?:accept|codex-action-integrity):/);
  assert.doesNotMatch(workflow, /architecture-gate \/ accept/);
  assert.doesNotMatch(workflow, /owner-amendment-merge-group-gate\.mjs/);
  assert.doesNotMatch(workflow, /secrets\.OPENAI_API_KEY[\s\S]*merge_group/);
  assert.doesNotMatch(workflow, /OWNER_AMENDMENT_TAG_RULESET_ID/);
  const script = readFileSync(new URL('../scripts/owner-amendment-merge-group-gate.mjs', import.meta.url), 'utf8');
  assert.match(script, /git\(\['rev-parse', 'HEAD'\]\)/);
  assert.match(script, /runtimeRevision !== selection\.bBaseSha/);
  assert.match(script, /eligibilityReviewInputs\(/);
  assert.match(script, /prepared-context\.json/);
  assert.match(script, /git\(\['--no-replace-objects', 'diff', '--binary', '--no-ext-diff', '--no-renames'/);
  assert.match(script, /hash\(promptBytes\) !== prepared\.promptSha256 \|\| hash\(schemaBytes\) !== prepared\.schemaSha256 \|\|\s*hash\(diffBytes\) !== prepared\.diffSha256/);
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
