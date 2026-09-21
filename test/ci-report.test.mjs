import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMENT_MARKER, classifyReview, digestDecision, renderReport, upsertPullRequestComment } from '../src/ci-report.mjs';

const decision = {
  decision: 'BLOCK',
  summary: 'Provider boundary is crossed. @team <script>alert(1)</script>',
  reviewedScope: ['src/a.mjs'],
  authority: ['The protected base architecture contract governs.'],
  authorityFiles: ['docs/architecture.md'],
  prohibitedChanges: ['Do not move ownership'],
  gates: {
    project: { decision: 'BLOCK', summary: 'Wrong | owner', dependencyDirection: 'Must point inward' },
    migration: { applicable: false, decision: 'NOT_APPLICABLE', summary: 'Not applicable' },
  },
};

test('classifies model decisions and renders a bounded sanitized report', () => {
  const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success', rawDecision: JSON.stringify(decision) });
  const report = renderReport(classified, { reviewedSha: 'abc123', runUrl: 'https://example.test/run/1' });
  assert.equal(classified.conclusion, 'BLOCK');
  assert.match(report, /Architecture Gate — BLOCK/);
  assert.match(report, /Wrong \\| owner/);
  assert.match(report, /Governing authority/);
  assert.match(report, /protected base architecture contract/);
  assert.match(report, /@\u200bteam/);
  assert.doesNotMatch(report, /<script>/);
  assert.ok(report.endsWith(`${COMMENT_MARKER}\n`));
  assert.ok(report.length <= 60_000);
});

test('distinguishes waiver, policy failure, review failure, and malformed output', () => {
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success', rawDecision: '{"decision":"PASS","summary":"ok"}' }).conclusion, 'PASS');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success', rawDecision: '{"decision":"OWNER_DECISION","summary":"choose"}' }).conclusion, 'OWNER_DECISION');
  assert.equal(classifyReview({ mode: 'local-only', policyResult: 'success' }).conclusion, 'WAIVED');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'failure' }).conclusion, 'ERROR');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'failure' }).conclusion, 'ERROR');
  assert.equal(classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success', rawDecision: '{}' }).conclusion, 'ERROR');
});

test('binds owner decisions to a stable canonical decision digest', () => {
  const first = { decision: 'OWNER_DECISION', summary: 'choose', gates: { b: 2, a: 1 } };
  const reordered = { gates: { a: 1, b: 2 }, summary: 'choose', decision: 'OWNER_DECISION' };
  assert.equal(digestDecision(first), digestDecision(reordered));
  assert.match(digestDecision(first), /^[a-f0-9]{64}$/);
  const report = renderReport({ conclusion: 'OWNER_DECISION', summary: 'choose', decision: first }, { headSha: 'head123' });
  assert.match(report, /protected `architecture-owner-decision` environment/);
  assert.match(report, /PR head: `head123`/);
  assert.match(report, /Decision SHA-256: `[a-f0-9]{64}`/);
});

test('accepts a consumer-valid decision without a summary and supplies reporting copy', () => {
  const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success', rawDecision: '{"decision":"PASS"}' });
  assert.equal(classified.conclusion, 'PASS');
  assert.equal(classified.summary, 'No summary was supplied by the architecture reviewer.');
  assert.match(renderReport(classified), /No summary was supplied/);
});

test('truncates oversized reports while retaining the ownership marker', () => {
  const oversized = { ...decision, reviewedScope: Array.from({ length: 100 }, (_, index) => `${index}-${'x'.repeat(3_000)}`) };
  const report = renderReport(
    { conclusion: 'BLOCK', summary: oversized.summary, decision: oversized },
    { reviewedSha: 'abc123', runUrl: 'https://example.test/run/1', workflowRef: 'o/r/.github/workflows/gate.yml@abc123' },
  );
  assert.ok(report.length <= 60_000);
  assert.match(report, /Report truncated/);
  assert.match(report, /Reviewed commit: `abc123`/);
  assert.match(report, /\[Actions run\]\(https:\/\/example\.test\/run\/1\)/);
  assert.match(report, /Workflow: `o\/r\/\.github\/workflows\/gate\.yml@\u200babc123`/);
  assert.ok(report.endsWith(`${COMMENT_MARKER}\n`));
});

test('creates a marker-owned pull request comment', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? { ok: true, json: async () => [] } : { ok: true };
  };
  const result = await upsertPullRequestComment({ fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token', body: COMMENT_MARKER });
  assert.deepEqual(result, { status: 'created' });
  assert.equal(calls[1].options.method, 'POST');
  assert.match(calls[1].url, /issues\/7\/comments$/);
});

test('updates the existing bot comment and ignores lookalike user comments', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: true, json: async () => [
          { id: 10, user: { login: 'someone' }, body: COMMENT_MARKER },
          { id: 11, user: { login: 'github-actions[bot]' }, body: COMMENT_MARKER },
        ] }
      : { ok: true };
  };
  const result = await upsertPullRequestComment({ fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token', body: COMMENT_MARKER });
  assert.deepEqual(result, { status: 'updated' });
  assert.equal(calls[1].options.method, 'PATCH');
  assert.match(calls[1].url, /issues\/comments\/11$/);
});

test('follows comment pagination before updating the marker-owned comment', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => Array.from({ length: 100 }, (_, id) => ({ id, user: { login: 'someone' }, body: 'ordinary comment' })),
        headers: { get: () => '<https://api.test/repos/o/r/issues/7/comments?per_page=100&page=2>; rel="next", <https://api.test/repos/o/r/issues/7/comments?per_page=100&page=2>; rel="last"' },
      };
    }
    if (calls.length === 2) {
      return {
        ok: true,
        json: async () => [{ id: 101, user: { login: 'github-actions[bot]' }, body: COMMENT_MARKER }],
        headers: { get: () => '' },
      };
    }
    return { ok: true };
  };
  const result = await upsertPullRequestComment({ fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token', body: COMMENT_MARKER });
  assert.deepEqual(result, { status: 'updated' });
  assert.match(calls[1].url, /page=2/);
  assert.match(calls[2].url, /issues\/comments\/101$/);
});

test('skips comments without write context and reports API failures to the caller', async () => {
  assert.equal((await upsertPullRequestComment({})).status, 'skipped');
  await assert.rejects(
    upsertPullRequestComment({ fetchImpl: async () => ({ ok: false, status: 403 }), apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token', body: 'x' }),
    /HTTP 403/,
  );
});
