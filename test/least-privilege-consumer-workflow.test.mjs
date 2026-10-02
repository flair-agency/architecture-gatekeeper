import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const consumer = readFileSync(new URL('../.github/workflows/architecture-gate-consumer.yml', import.meta.url), 'utf8');
const self = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
const caller = readFileSync(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');

function job(source, name) {
  const start = source.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `missing job ${name}`);
  const end = source.slice(start + 1).search(/^  [a-z][a-z-]*:\n/m);
  return source.slice(start, end < 0 ? undefined : start + 1 + end);
}

test('ordinary consumer reusable workflow requests no self-only OIDC or attestation permissions', () => {
  assert.doesNotMatch(consumer, /id-token:\s*write|attestations:\s*write/);
  assert.doesNotMatch(consumer, /self-flex-probe|ARCHITECTURE_GATE_SELF_FLEX|service_tier/);
  for (const name of ['block-review-record', 'owner-amendment-owner-decision-record',
    'owner-amendment-attempt-classifier', 'owner-amendment-semantic-eligibility',
    'owner-amendment-semantic-eligibility-signer']) {
    assert.doesNotMatch(consumer, new RegExp(`^  ${name}:`, 'm'));
    assert.doesNotMatch(consumer, new RegExp(`needs:.*${name}`));
  }
  assert.match(consumer, /Reject self-only OWNER_AMENDMENT policy on the consumer workflow/);
  assert.match(consumer, /OWNER_AMENDMENT_GRADE: \$\{\{ steps\.resolve\.outputs\.ownerAmendmentGrade \}\}/);
  assert.match(consumer, /test "\$OWNER_AMENDMENT_GRADE" = G0/);
  assert.match(consumer, /exit 1/);
});

test('self producer keeps its existing reusable workflow and exact protected evidence jobs', () => {
  assert.match(caller, /uses: \.\/\.github\/workflows\/architecture-gate\.yml/);
  for (const name of ['block-review-record', 'owner-amendment-owner-decision-record',
    'owner-amendment-semantic-eligibility-signer']) {
    const block = job(self, name);
    assert.match(block, /id-token: write/);
    assert.match(block, /attestations: write/);
  }
  assert.match(self, /name: Architecture Gate/);
  assert.match(self, /WORKFLOW_PATH: \.github\/workflows\/self-architecture-gate\.yml/);
  assert.match(self, /owner-amendment-semantic-eligibility-signer:/);
});

test('consumer adapter keeps protected policy resolution and selected OWNER_ADDITION implementation aligned', () => {
  const resolveStep = source => source.match(/      - name: Resolve policy from protected base revision\n([\s\S]*?)(?=\n      - name: )/)?.[1];
  assert.equal(resolveStep(consumer), resolveStep(self));
  const selfAddition = job(self, 'owner-addition');
  const selfEnvironment = "    environment: ${{ needs.policy.outputs.self_review_environment == 'true' && 'architecture-gate-self-protected' || null }}\n";
  // The self-only credential binding is the sole permitted job difference.
  assert.doesNotMatch(job(consumer, 'owner-addition'), /^    environment:/m);
  assert.equal(job(consumer, 'owner-addition'), selfAddition.replace(selfEnvironment, ''));
  assert.match(consumer, /owner_addition_grade: \$\{\{ steps\.resolve\.outputs\.ownerAdditionGrade \}\}/);
  assert.match(consumer, /needs\.policy\.outputs\.policy_version == '5' && needs\.policy\.outputs\.adoption_evidence_producer == 'github-actions'/);
  assert.match(consumer, /name: Materialize recorded-base legacy authority before review/);
  assert.match(consumer, /name: Require exact reported legacy authority files/);
});
