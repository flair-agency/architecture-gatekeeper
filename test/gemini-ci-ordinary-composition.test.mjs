import test from 'node:test';
import assert from 'node:assert/strict';
import { completePreparedCiReview } from '../dist/complete-prepared-ci-review.mjs';
import { classifyReview, renderReport } from '../dist/ci-report.mjs';
import { assertEnforcedAcceptance } from '../dist/ci-enforced-acceptance.mjs';

const authorityIds = [
  'architecture-contract', 'architecture-authority-set', 'architecture-owner-addition',
  'architecture-owner-amendment', 'architecture-review-execution', 'architecture-self-profile',
];
// Synthetic metadata exercises six-ID validation and report formatting only. It does not contain or
// authenticate the canonical authority bytes, establish complete authority sourcing, or prove producer identity.
const authorityProvenance = {
  version: 1,
  manifestSha256: 'a'.repeat(64),
  setDigest: 'b'.repeat(64),
  members: authorityIds.map((id, index) => ({ id, repository: 'flair-agency/architecture-gatekeeper',
    resolvedCommit: 'c'.repeat(40), path: `docs/architecture-fixture-${index}.md`, sha256: String(index).padStart(64, '0') })),
};
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
  required: ['decision', 'authorityIds'], additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
    authorityIds: { type: 'array', minItems: authorityIds.length, items: { type: 'string' } },
    summary: { type: 'string' },
  },
};
const validationRules = { version: 1, rules: [{
  when: { path: '/decision', equals: 'BLOCK' },
  require: { path: '/summary', equals: 'documented' },
  message: 'BLOCK requires its reason to be documented.',
}] };
const execution = {
  expectedExecution: { provider: 'gemini', requestedModel: 'gemini-3.8-flash', requestedSettings: { thinkingLevel: 'MEDIUM' } },
  hostStepOutcome: 'success',
  maxResponseBytes: 65_536,
};

function complete(response, hostStepOutcome = 'success') {
  return completePreparedCiReview({
    executionInput: { ...execution, hostStepOutcome, rawResponse: response },
    schemaBytes: JSON.stringify(schema), authorityProvenance, validationRules, maxSchemaBytes: 1_048_576,
  });
}

function reportAndAccept(result) {
  const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: JSON.stringify(result.decision) });
  const report = renderReport(classified, { authorityProvenance, reviewedSha: '3'.repeat(40), headSha: '2'.repeat(40) });
  return { classified, report, accepted: assertEnforcedAcceptance({ reviewResult: 'success', conclusion: classified.conclusion }) };
}

test('synthetic Gemini completion flows through the ordinary report and acceptance validators', () => {
  // The completed execution is synthetic Gemini-labeled input to the provider-neutral completion boundary.
  // This exercises composition only: no Gemini process/model, workflow wiring, host policy, producer identity,
  // same-attempt binding, or canonical authority-byte materialization is established by this test.
  const pass = complete(JSON.stringify({ decision: 'PASS', summary: 'Fixture change satisfies selected rules.', authorityIds }));
  assert.equal(pass.execution.status, 'completed');
  assert.deepEqual(pass.decision.authorityIds, authorityIds);
  const passFlow = reportAndAccept(pass);
  assert.equal(passFlow.classified.conclusion, 'PASS');
  assert.equal(passFlow.accepted.route, 'ordinary-pass');
  assert.match(passFlow.report, /Selected Authority Set/);
  assert.match(passFlow.report, /Set SHA-256: `bbbb/);
  assert.match(passFlow.report, /Reviewed commit:/);

  for (const changedIds of [authorityIds.slice(1), [...authorityIds.slice(0, 5), 'extra-authority'],
    [authorityIds[0], authorityIds[0], ...authorityIds.slice(2)]]) {
    assert.throws(() => complete(JSON.stringify({ decision: 'PASS', summary: 'Invalid ID coverage.', authorityIds: changedIds })),
      /Authority ID|Authority Set|too few items/i);
  }

  const blocked = complete(JSON.stringify({ decision: 'BLOCK', summary: 'documented', authorityIds }));
  const blockedClassified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    rawDecision: JSON.stringify(blocked.decision) });
  assert.equal(blockedClassified.conclusion, 'BLOCK');
  assert.match(renderReport(blockedClassified, { authorityProvenance }), /Architecture Gate — BLOCK/);
  assert.throws(() => assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'BLOCK' }), /requires model-backed PASS/i);
  assert.throws(() => complete(JSON.stringify({ decision: 'BLOCK', authorityIds })), /BLOCK requires its reason/);

  const stalePass = complete(JSON.stringify({ decision: 'PASS', authorityIds }), 'failure');
  assert.equal(stalePass.execution.status, 'incomplete');
  assert.equal(Object.hasOwn(stalePass, 'decision'), false);
  const failed = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'failure', rawDecision: '' });
  assert.equal(failed.conclusion, 'ERROR');
  assert.match(renderReport(failed, { authorityProvenance }), /did not complete successfully/);
  assert.throws(() => assertEnforcedAcceptance({ reviewResult: 'failure', conclusion: 'PASS' }), /did not complete successfully/i);
});
