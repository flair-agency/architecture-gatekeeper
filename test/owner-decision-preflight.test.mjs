import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAndValidateEnvironment, validateEnvironment } from '../src/owner-decision-preflight.mjs';

const protectedEnvironment = {
  can_admins_bypass: false,
  protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { login: 'owner' } }] }],
};

test('accepts a protected environment with a required reviewer and no admin bypass', () => {
  assert.deepEqual(validateEnvironment(protectedEnvironment), ['owner']);
});

test('fails closed for missing review protection or enabled/unknown admin bypass', () => {
  assert.throws(() => validateEnvironment({ ...protectedEnvironment, can_admins_bypass: true }), /disable administrator bypass/);
  assert.throws(() => validateEnvironment({ protection_rules: protectedEnvironment.protection_rules }), /disable administrator bypass/);
  assert.throws(() => validateEnvironment({ can_admins_bypass: false, protection_rules: [] }), /require reviewer approval/);
  assert.throws(() => validateEnvironment({ can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', reviewers: [] }] }), /name at least one/);
});

test('reads the fixed repository environment through the GitHub API', async () => {
  const calls = [];
  const result = await fetchAndValidateEnvironment({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => protectedEnvironment };
    },
    apiUrl: 'https://api.test', repository: 'o/r', environment: 'architecture-owner-decision', token: 'token',
  });
  assert.deepEqual(result.reviewers, ['owner']);
  assert.equal(calls[0].url, 'https://api.test/repos/o/r/environments/architecture-owner-decision');
});
