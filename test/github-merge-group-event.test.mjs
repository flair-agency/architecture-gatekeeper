import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGithubMergeGroupEvent } from '../dist/github-merge-group-event.mjs';

const payload = () => ({
  action: 'checks_requested',
  repository: { full_name: 'flair-agency/architecture-gatekeeper', id: 123 },
  merge_group: {
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    base_ref: 'refs/heads/main',
    head_ref: 'refs/heads/gh-readonly-queue/main/pr-12-abcdef',
  },
});

test('parses merge_group checks_requested into immutable event facts', () => {
  const result = parseGithubMergeGroupEvent(payload());
  assert.deepEqual(result, {
    status: 'PARSED_MERGE_GROUP_EVENT',
    action: 'checks_requested',
    repository: 'flair-agency/architecture-gatekeeper',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    baseRef: 'refs/heads/main',
  });
  assert.equal(Object.isFrozen(result), true);
});

test('fails closed for missing or malformed event fields', async t => {
  const cases = [
    ['null payload', null],
    ['array payload', []],
    ['wrong action', { ...payload(), action: 'destroyed' }],
    ['missing action', { ...payload(), action: undefined }],
    ['missing repository', { ...payload(), repository: undefined }],
    ['malformed repository', { ...payload(), repository: { full_name: 'owner/repo/extra' } }],
    ['missing merge_group', { ...payload(), merge_group: undefined }],
    ['array merge_group', { ...payload(), merge_group: [] }],
    ['missing base SHA', { ...payload(), merge_group: { ...payload().merge_group, base_sha: undefined } }],
    ['malformed head SHA', { ...payload(), merge_group: { ...payload().merge_group, head_sha: 'z'.repeat(40) } }],
    ['equal SHAs', { ...payload(), merge_group: { ...payload().merge_group, head_sha: 'a'.repeat(40) } }],
    ['missing base ref', { ...payload(), merge_group: { ...payload().merge_group, base_ref: undefined } }],
    ['non-branch base ref', { ...payload(), merge_group: { ...payload().merge_group, base_ref: 'refs/tags/v1' } }],
    ['unsafe base ref', { ...payload(), merge_group: { ...payload().merge_group, base_ref: 'refs/heads/main..evil' } }],
  ];
  for (const [name, value] of cases) await t.test(name, () => {
    const result = parseGithubMergeGroupEvent(value);
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /^GitHub merge_group event /);
    assert.equal(Object.hasOwn(result, 'headSha'), false);
  });
});


test('keeps reread event properties as observations when accessors change after checks', () => {
  const event = payload();
  const laterSha = { observed: 'later SHA value' };
  const laterAction = { observed: 'later action value' };
  let shaReads = 0;
  let actionReads = 0;
  Object.defineProperty(event.merge_group, 'base_sha', { get() {
    return ++shaReads <= 3 ? 'a'.repeat(40) : laterSha;
  } });
  Object.defineProperty(event, 'action', { get() {
    return ++actionReads === 1 ? 'checks_requested' : laterAction;
  } });
  const observed = parseGithubMergeGroupEvent(event);
  assert.equal(observed.status, 'PARSED_MERGE_GROUP_EVENT');
  assert.equal(observed.baseSha, laterSha);
  assert.equal(observed.action, laterAction);
  assert.equal(shaReads, 4);
  assert.equal(actionReads, 2);
});
