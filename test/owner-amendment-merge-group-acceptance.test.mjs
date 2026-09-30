import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOwnerAmendmentMergeGroupAcceptanceVerifier } from '../src/owner-amendment-merge-group-acceptance.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40), groupSha = 'c'.repeat(40);
const triggerSha = '1'.repeat(64), amendmentSha = '2'.repeat(64), policySha = '3'.repeat(64);
const authoritySetDigest = '4'.repeat(64), receiptSha = '5'.repeat(64), artifactSha = '6'.repeat(64);
const tagOid = 'd'.repeat(40), tagNamespace = 'refs/tags/architecture-gatekeeper/amendments';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const canonicalBytes = value => Buffer.from(`${JSON.stringify(canonical(value))}\n`);
const runtime = { repository, revision: baseSha };
const event = { action: 'checks_requested', repository: { full_name: repository }, merge_group: {
  base_ref: 'refs/heads/main', base_sha: baseSha, head_sha: groupSha,
} };

function fixture(profile = 'completed-block-v1', edits = {}) {
  const decision = profile === 'completed-block-v1' ? 'BLOCK' : 'OWNER_DECISION';
  const ids = ['architecture-contract'];
  const selection = { status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT', repository, repositoryId: 17,
    mergeGroupBaseSha: baseSha, mergeGroupHeadSha: groupSha, bPrNumber: '8', bBaseSha: baseSha,
    bHeadSha: bSha, queueEntryState: 'AWAITING_CHECKS', queueEnteredAt: '2026-09-29T12:00:00Z' };
  const policy = { status: 'RESOLVED_PREVIOUS_OWNER_AMENDMENT_POLICY', repository, baseSha,
    grade: 'G0', scope: 'authority-only', triggerProfile: profile,
    authorityId: ids[0], authorityPath: 'docs/architecture.md', tagNamespace,
    authoritySha256: '8'.repeat(64), policySha256: policySha, authoritySetDigest, authorityIds: ids };
  const trigger = { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository, baseSha,
    triggerProfile: profile, decision,
    reviewRecordSha256: triggerSha, producerWorkflowPath: '.github/workflows/self-architecture-gate.yml',
    producerWorkflowSha: baseSha, producerWorkflowRef: 'refs/heads/main', producerRunId: '101',
    producerRunAttempt: '1', provenanceVerified: true };
  const tag = { status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha, bSha,
    triggerProfile: profile, triggerReviewRecordSha256: triggerSha, amendmentRecordSha256: amendmentSha,
    authorityId: ids[0], authorityPath: 'docs/architecture.md', previousAuthoritySha256: '8'.repeat(64),
    amendedAuthoritySha256: '9'.repeat(64), priorAuthoritySetDigest: authoritySetDigest,
    resultingAuthoritySetDigest: '7'.repeat(64), purpose: 'Resolve the selected authority trigger', targetValidated: true,
    tagRef: `${tagNamespace}/${bSha}`, tagObjectOid: tagOid, observedTagRefOid: tagOid,
    protectedAgainstUpdateAndDeletion: true };
  const producer = { workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: baseSha,
    workflowRef: 'refs/heads/main', runId: '202', runAttempt: '1', jobId: 'owner-amendment-eligibility' };
  const receipt = { version: 1, kind: 'owner-amendment-semantic-eligibility-receipt', eligibility: 'ELIGIBLE',
    repository, baseSha, bSha, triggerProfile: profile, triggerReviewRecordSha256: triggerSha,
    amendmentRecordSha256: amendmentSha, policyRevision: baseSha, policySha256: policySha,
    authoritySetDigest, authorityIds: ids,
    changes: [{ path: 'docs/architecture.md', beforeSha256: '8'.repeat(64), afterSha256: '9'.repeat(64) }],
    diffSha256: 'a'.repeat(64), promptSha256: 'b'.repeat(64), schemaSha256: 'c'.repeat(64),
    decisionSha256: 'e'.repeat(64), model: 'gpt-6-sol', reasoningEffort: 'medium',
    tag: { tagRef: tag.tagRef, tagObjectOid: tagOid, observedTagRefOid: tagOid },
    producer, gatekeeper: { repository, revision: baseSha, package: null } };
  const receiptBytes = canonicalBytes(receipt);
  const eligibility = { status: 'VERIFIED_OWNER_AMENDMENT_ELIGIBILITY_EVIDENCE', receiptBytes,
    receiptSha256: hash(receiptBytes), artifactId: '9001', artifactSha256: artifactSha,
    provenanceVerified: true, checkConclusion: 'success', completedAt: '2026-09-29T11:59:00Z',
    producerWorkflowPath: producer.workflowPath, producerWorkflowSha: producer.workflowSha,
    producerWorkflowRef: producer.workflowRef, producerRunId: producer.runId,
    producerRunAttempt: producer.runAttempt, producerJobId: producer.jobId,
    gatekeeperRepository: repository, gatekeeperRevision: baseSha,
    principalAuthentication: 'not_verified', exactClaimAuthorization: 'not_verified' };
  const values = { selection, policy, trigger, tag, eligibility, ...edits };
  const calls = [];
  const verifier = createOwnerAmendmentMergeGroupAcceptanceVerifier({ runtime,
    selectBContext: async () => { calls.push('select'); return values.selection; },
    resolveProtectedPolicy: async ({ selection: selected, baseSha: resolvedBase }) => {
      calls.push('policy'); assert.equal(selected.bBaseSha, resolvedBase); return values.policy;
    },
    verifyTrigger: async () => { calls.push('trigger'); return values.trigger; },
    verifyTag: async () => { calls.push('tag'); return values.tag; },
    verifyEligibility: async () => { calls.push('eligibility'); return values.eligibility; },
  });
  return { verifier, calls, values };
}

for (const profile of ['completed-block-v1', 'completed-owner-decision-self-v1']) {
  test(`accepts a fully verified ${profile} merge-group chain without a queue model call`, async () => {
    const f = fixture(profile);
    const result = await f.verifier.verify(event);
    assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION');
    assert.equal(result.eligibility, 'eligible');
    assert.equal(result.adoption, 'pending');
    assert.equal(result.canonical, 'pending');
    assert.equal(result.triggerProfile, profile);
    assert.equal(result.triggerDecision, profile === 'completed-block-v1' ? 'BLOCK' : 'OWNER_DECISION');
    assert.deepEqual(result.assurance, { principalAuthentication: 'not_verified', exactClaimAuthorization: 'not_verified' });
    assert.deepEqual(f.calls, ['select', 'policy', 'trigger', 'tag', 'eligibility']);
    assert.equal(Object.hasOwn(result, 'semanticPass'), false);
  });
}

test('fails closed on absent prior opt-in and leaves profile selection disabled by default', async () => {
  const f = fixture();
  f.values.policy = { ...f.values.policy, status: 'UNSELECTED' };
  const result = await f.verifier.verify(event);
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /previous protected-base policy/);
  assert.deepEqual(f.calls, ['select', 'policy']);
});

test('fails closed for profile, trigger decision, target B, tag or receipt mismatches', async t => {
  const cases = [
    ['wrong policy profile', 'completed-block-v1', 'policy', value => ({ ...value, triggerProfile: 'completed-owner-decision-self-v1' })],
    ['wrong trigger result', 'completed-block-v1', 'trigger', value => ({ ...value, decision: 'PASS' })],
    ['unselected OWNER_DECISION identity field', 'completed-owner-decision-self-v1', 'trigger', value => ({ ...value, ownerDecisionId: 'unadopted-id' })],
    ['wrong trigger digest', 'completed-block-v1', 'tag', value => ({ ...value, triggerReviewRecordSha256: '8'.repeat(64) })],
    ['wrong tag ref', 'completed-block-v1', 'tag', value => ({ ...value, tagRef: `${tagNamespace}/e${bSha.slice(1)}` })],
    ['wrong receipt profile', 'completed-block-v1', 'eligibility', value => {
      const receipt = JSON.parse(value.receiptBytes.toString('utf8'));
      const receiptBytes = canonicalBytes({ ...receipt, triggerProfile: 'completed-owner-decision-self-v1' });
      return { ...value, receiptBytes, receiptSha256: hash(receiptBytes) };
    }],
    ['non-eligible receipt', 'completed-block-v1', 'eligibility', value => {
      const receipt = JSON.parse(value.receiptBytes.toString('utf8'));
      const receiptBytes = canonicalBytes({ ...receipt, eligibility: 'INELIGIBLE' });
      return { ...value, receiptBytes, receiptSha256: hash(receiptBytes) };
    }],
  ];
  for (const [name, profile, key, edit] of cases) await t.test(name, async () => {
    const f = fixture(profile); f.values[key] = edit(f.values[key]);
    const result = await f.verifier.verify(event);
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('requires the eligibility producer to finish before the authenticated queue entry', async () => {
  const f = fixture('completed-owner-decision-self-v1');
  f.values.eligibility = { ...f.values.eligibility, completedAt: '2026-09-29T12:00:00Z' };
  const result = await f.verifier.verify(event);
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /before B entered the merge queue/);
});

test('requires trusted verifiers and valid runtime identity at construction', () => {
  assert.throws(() => createOwnerAmendmentMergeGroupAcceptanceVerifier({ runtime }), /trusted selectBContext adapter/);
  const f = fixture();
  assert.throws(() => createOwnerAmendmentMergeGroupAcceptanceVerifier({
    selectBContext: async () => f.values.selection,
    resolveProtectedPolicy: async () => f.values.policy,
    verifyTrigger: async () => f.values.trigger,
    verifyTag: async () => f.values.tag,
    verifyEligibility: async () => f.values.eligibility,
    runtime: { repository, revision: 'invalid' },
  }), /runtime identity is invalid/);
});
