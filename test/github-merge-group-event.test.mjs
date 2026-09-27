import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGithubMergeGroupEvent } from '../src/github-merge-group-event.mjs';

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
