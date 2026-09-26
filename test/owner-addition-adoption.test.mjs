import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOwnerAdditionAdoption } from '../src/owner-addition-adoption.mjs';

const sha = char => char.repeat(40);
const digest = char => char.repeat(64);
const times = { eligible: '2026-09-26T01:00:00.000Z', merged: '2026-09-26T02:00:00.000Z' };

function fixture() {
  const c = { repository: 'flair-agency/example', targetBranch: 'main', pullRequest: { number: 129 },
    baseSha: sha('a'), bSha: sha('b'), bTree: sha('c'), authorityDigest: digest('d') };
  const procedure = { status: 'verified', digest: digest('1'), repository: c.repository, baseSha: c.baseSha, bSha: c.bSha,
    targetBranch: c.targetBranch, pullRequestNumber: c.pullRequest.number, tagTargetSha: c.bSha, tagObjectOid: sha('7'),
    ownerDecisionId: 'missing-choice', authoritySetDigest: digest('2'), authorityIds: ['architecture', 'policy'] };
  const ordinaryDecision = { status: 'verified', decision: 'OWNER_DECISION', ownerDecisionId: procedure.ownerDecisionId,
    repository: c.repository, baseSha: c.baseSha, bSha: c.bSha, authoritySetDigest: digest('2'), authorityIds: ['architecture', 'policy'] };
  const authoritySet = { status: 'verified', ids: ['architecture', 'policy'], digest: digest('2') };
  const eligibility = { status: 'verified', digest: digest('3'), result: 'eligible', repository: c.repository,
    baseSha: c.baseSha, bSha: c.bSha, pullRequestNumber: c.pullRequest.number,
    authoritySetDigest: authoritySet.digest, authorityIds: [...authoritySet.ids] };
  const provenance = { status: 'verified', selection: 'recorded-base-policy',
    workflow: { runId: 9001, attempt: 2, jobId: 'owner-addition-eligibility', workflowPath: '.github/workflows/gate.yml', callerPath: '.github/workflows/review.yml' },
    repository: c.repository, targetBranch: c.targetBranch, pullRequestNumber: c.pullRequest.number,
    baseSha: c.baseSha, bSha: c.bSha, authoritySetDigest: authoritySet.digest,
    procedureDigest: procedure.digest, eligibilityDigest: eligibility.digest, completedAt: times.eligible };
  const merge = { hostMetadata: { status: 'verified', repository: c.repository, targetBranch: c.targetBranch,
      pullRequestNumber: c.pullRequest.number, headSha: c.bSha, baseSha: c.baseSha, state: 'merged',
      mergeSha: sha('e'), mergedAt: times.merged },
    commit: { sha: sha('e'), parents: [c.baseSha, c.bSha], tree: c.bTree } };
  const eligibilityEvidence = { status: 'verified', provenance, completedAt: times.eligible };
  const targetReadback = { status: 'verified', repository: c.repository, targetRef: 'refs/heads/main',
    targetSha: sha('f'), ancestorShas: [sha('e'), c.bSha, c.baseSha], authorityDigest: c.authorityDigest };
  return { candidate: c, procedure, ordinaryDecision, authoritySet, eligibility, eligibilityEvidence, merge, targetReadback };
}

test('exact eligible B stays pending before merge and preserves independent assurance limits', () => {
  const input = fixture(); input.merge = null; input.targetReadback = null;
  const result = evaluateOwnerAdditionAdoption(input);
  assert.equal(result.eligibility, 'eligible');
  assert.equal(result.adoption, 'pending');
  assert.equal(result.canonical, 'pending');
  assert.deepEqual(result.eligibilityProducer, { runId: '9001', attempt: 2, jobId: 'owner-addition-eligibility',
    workflowPath: '.github/workflows/gate.yml', callerPath: '.github/workflows/review.yml' });
  assert.equal(result.eligibilityCompletedAt, times.eligible);
  assert.equal(result.principalAuthentication, 'not_verified');
  assert.equal(result.hostEnforcement, 'not_verified');
});

test('valid merge commit, pre-merge eligibility provenance and canonical readback produce valid adoption', () => {
  const result = evaluateOwnerAdditionAdoption(fixture());
  assert.equal(result.eligibility, 'eligible');
  assert.equal(result.adoption, 'valid');
  assert.equal(result.canonical, 'verified');
});

test('a merged, ineligible B can be canonical while adoption stays invalid', () => {
  const input = fixture(); input.eligibility = { ...input.eligibility, result: 'ineligible' };
  input.eligibilityEvidence.provenance.eligibilityDigest = input.eligibility.digest;
  const result = evaluateOwnerAdditionAdoption(input);
  assert.equal(result.eligibility, 'ineligible');
  assert.equal(result.adoption, 'invalid');
  assert.equal(result.canonical, 'verified');
});

test('known ineligible B is invalid for adoption even before merge or readback', () => {
  const input = fixture(); input.eligibility = { ...input.eligibility, result: 'ineligible' };
  input.eligibilityEvidence.provenance.eligibilityDigest = input.eligibility.digest;
  input.merge = null; input.targetReadback = null;
  const result = evaluateOwnerAdditionAdoption(input);
  assert.equal(result.eligibility, 'ineligible');
  assert.equal(result.adoption, 'invalid');
  assert.equal(result.canonical, 'pending');
});

test('changed candidate bindings, unverified/late producer evidence, wrong PR metadata, parent order and tree fail adoption', () => {
  const mutations = [
    [input => { input.eligibility.bSha = sha('9'); }, 'invalid'],
    [input => { input.eligibilityEvidence.status = 'unverified'; }, 'incomplete'],
    [input => { input.eligibilityEvidence.completedAt = times.merged; input.eligibilityEvidence.provenance.completedAt = times.merged; }, 'invalid'],
    [input => { input.merge.hostMetadata.pullRequestNumber += 1; }, 'invalid'],
    [input => { input.merge.commit.parents.reverse(); }, 'invalid'],
    [input => { input.merge.commit.tree = sha('9'); }, 'invalid'],
    [input => { input.merge.commit.parents = [input.candidate.baseSha, sha('9')]; }, 'invalid'],
  ];
  for (const [mutate, expected] of mutations) {
    const input = fixture(); mutate(input);
    const result = evaluateOwnerAdditionAdoption(input);
    assert.equal(result.adoption, expected);
  }
});

test('squash or rebase integration cannot satisfy the v0.5.1 merge-commit route', () => {
  for (const parents of [[sha('a')], [sha('a'), sha('9')]]) {
    const input = fixture(); input.merge.commit.parents = parents;
    assert.equal(evaluateOwnerAdditionAdoption(input).adoption, 'invalid');
  }
});

test('missing or unverified pre-merge provenance stays incomplete after merge readback', () => {
  for (const evidence of [null, { ...fixture().eligibilityEvidence, status: 'unverified' },
    { ...fixture().eligibilityEvidence, provenance: { ...fixture().eligibilityEvidence.provenance, status: 'unverified' } }]) {
    const input = fixture(); input.eligibilityEvidence = evidence;
    const result = evaluateOwnerAdditionAdoption(input);
    assert.equal(result.adoption, 'incomplete');
    assert.equal(result.canonical, 'verified');
  }
});

test('malformed pre-merge provenance is invalid, and an unverified merge mapping cannot establish canonical placement', () => {
  const malformed = fixture(); malformed.eligibilityEvidence.provenance.bSha = sha('9');
  assert.equal(evaluateOwnerAdditionAdoption(malformed).adoption, 'invalid');

  const badMerge = fixture(); badMerge.merge.commit.tree = sha('9');
  const result = evaluateOwnerAdditionAdoption(badMerge);
  assert.equal(result.adoption, 'invalid');
  assert.equal(result.canonical, 'invalid');
});

test('readback reports canonical state independently and rejects a changed authority digest', () => {
  const input = fixture(); input.targetReadback.authorityDigest = digest('9');
  const result = evaluateOwnerAdditionAdoption(input);
  assert.equal(result.adoption, 'invalid');
  assert.equal(result.canonical, 'invalid');
});
