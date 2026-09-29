import assert from 'node:assert/strict';
import test from 'node:test';
import { composeOwnerAmendmentMergeGroupBlockInputs } from '../src/owner-amendment-merge-group-block-bridge.mjs';

const repository = 'flair-agency/example';
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40);
const groupHeadSha = 'c'.repeat(40);
const event = { action: 'checks_requested', repository: { full_name: repository }, merge_group: {
  base_ref: 'refs/heads/main', base_sha: baseSha, head_sha: groupHeadSha,
} };
const selected = { status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT', repository,
  mergeGroupBaseSha: baseSha, mergeGroupHeadSha: groupHeadSha,
  bBaseSha: baseSha, bHeadSha: bSha, bPrNumber: '204' };
const verified = { status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE', repository,
  baseSha, bSha, policyRevision: baseSha, policySha256: '1'.repeat(64), authorityId: 'architecture',
  previousAuthoritySha256: '2'.repeat(64), proposedAuthoritySha256: '3'.repeat(64),
  reviewRecordSha256: '4'.repeat(64), amendmentRecordSha256: '5'.repeat(64),
  attestationBundleSha256: '6'.repeat(64), tagObjectOid: '7'.repeat(40),
  observedTagRefOid: '7'.repeat(40), producerRunId: '42', producerRunAttempt: '1' };

function fixture({ selection = selected, evidence = verified, eventValue = event } = {}) {
  const calls = {};
  const result = () => composeOwnerAmendmentMergeGroupBlockInputs({ event: eventValue, token: 'token', fetchImpl: 'fetch',
    tagNamespace: 'refs/tags/test', tagRef: 'tag', rulesetId: 10, runGit: 'git',
    selectB(args) { calls.selection = args; return selection; },
    composeEvidence(args) { calls.evidence = args; return evidence; } });
  return { calls, result };
}

test('composes the exact selected base and B into verified BLOCK inputs only', async () => {
  const f = fixture(), result = await f.result();
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_BLOCK_INPUTS');
  assert.equal(f.calls.evidence.repository, repository);
  assert.equal(f.calls.evidence.baseSha, baseSha);
  assert.equal(f.calls.evidence.bSha, bSha);
  assert.equal(f.calls.evidence.tagNamespace, 'refs/tags/test');
  assert.equal(result.bSha, bSha);
  assert.equal(result.policyRevision, baseSha);
  assert.equal(Object.hasOwn(result, 'acceptance'), false);
  assert.equal(Object.hasOwn(result, 'selection'), false);
});

test('caller evidence options cannot replace selected repository, base, or B identities', async () => {
  let actual;
  await composeOwnerAmendmentMergeGroupBlockInputs({ event, token: 'token',
    repository: 'other/repo', baseSha: 'c'.repeat(40), bSha: 'd'.repeat(40),
    selectB: () => selected,
    composeEvidence(args) { actual = args; return verified; } });
  assert.equal(actual.repository, repository);
  assert.equal(actual.baseSha, baseSha);
  assert.equal(actual.bSha, bSha);
});

test('fails closed before evidence composition when selected context is incomplete or mismatched', async t => {
  for (const [name, selection] of [
    ['incomplete', { status: 'INCOMPLETE', reason: 'selection failed' }],
    ['wrong repository', { ...selected, repository: 'other/repo' }],
    ['wrong base', { ...selected, bBaseSha: 'c'.repeat(40) }],
    ['unrelated merge-group base', { ...selected, mergeGroupBaseSha: 'd'.repeat(40) }],
    ['unrelated merge-group head', { ...selected, mergeGroupHeadSha: 'e'.repeat(40) }],
  ]) await t.test(name, async () => {
    const f = fixture({ selection }), result = await f.result();
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(f.calls.evidence, undefined);
  });
});

test('rejects malformed merge-group event before selection or evidence composition', async () => {
  const f = fixture({ eventValue: { ...event, merge_group: { ...event.merge_group, head_sha: 'bad' } } });
  const result = await f.result();
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(f.calls.selection, undefined);
  assert.equal(f.calls.evidence, undefined);
});

test('fails closed on any evidence status or identity mismatch', async t => {
  for (const [name, evidence] of [
    ['incomplete evidence', { status: 'INCOMPLETE', reason: 'tag evidence failed' }],
    ['wrong repository', { ...verified, repository: 'other/repo' }],
    ['wrong base', { ...verified, baseSha: 'c'.repeat(40) }],
    ['wrong B', { ...verified, bSha: 'd'.repeat(40) }],
    ['wrong policy revision', { ...verified, policyRevision: 'e'.repeat(40) }],
  ]) await t.test(name, async () => {
    const f = fixture({ evidence }), result = await f.result();
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('rejects missing or malformed emitted evidence fields', async t => {
  const invalid = [
    ['policySha256', 'not-a-digest'], ['authorityId', 'Bad_ID'],
    ['previousAuthoritySha256', 'x'], ['proposedAuthoritySha256', 'x'],
    ['reviewRecordSha256', 'x'], ['amendmentRecordSha256', 'x'], ['attestationBundleSha256', 'x'],
    ['tagObjectOid', 'x'], ['observedTagRefOid', 'x'],
    ['producerRunId', 42], ['producerRunAttempt', 1],
  ];
  for (const [field, malformed] of invalid) {
    await t.test(`missing ${field}`, async () => {
      const f = fixture({ evidence: { ...verified, [field]: undefined } });
      assert.equal((await f.result()).status, 'INCOMPLETE');
    });
    await t.test(`malformed ${field}`, async () => {
      const f = fixture({ evidence: { ...verified, [field]: malformed } });
      assert.equal((await f.result()).status, 'INCOMPLETE');
    });
  }
});
