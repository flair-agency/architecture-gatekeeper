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

test('procedural G0 eligibility remains pending until merge and canonical readback', () => {
  const ownerDecision = { decision: 'OWNER_DECISION', ownerDecisionId: 'missing-choice', summary: 'choose' };
  const procedure = { procedure: 'VALID_G0_OWNER_ADDITION', missingDecisionId: 'missing-choice',
    policyRevision: 'a'.repeat(40), headSha: 'b'.repeat(40), tagObjectOid: 'c'.repeat(40) };
  const classified = classifyReview({ mode: 'procedural', policyResult: 'success', reviewResult: 'success',
    rawDecision: JSON.stringify(ownerDecision), ownerAdditionSelected: true, ownerAdditionResult: 'success',
    ownerAdditionEligibility: 'ELIGIBLE', ownerAdditionProcedure: procedure });
  assert.equal(classified.conclusion, 'OWNER_ADDITION_G0_PENDING');
  const report = renderReport(classified, { ownerAdditionProcedure: procedure });
  assert.match(report, /Eligibility: `eligible`/);
  assert.match(report, /Adoption: `pending`/);
  assert.match(report, /Canonical: `pending`/);
  assert.match(report, /Host enforcement: `not_verified`/);
  assert.doesNotMatch(report, /procedural acceptance result/);
  assert.equal(classifyReview({ mode: 'procedural', policyResult: 'success', reviewResult: 'success',
    rawDecision: JSON.stringify(ownerDecision), ownerAdditionSelected: true, ownerAdditionResult: 'failure' }).conclusion,
  'OWNER_DECISION');
});

test('reports owner decisions as unaccepted canonical-authority escalations', () => {
  const first = { decision: 'OWNER_DECISION', summary: 'choose', gates: { b: 2, a: 1 } };
  const reordered = { gates: { a: 1, b: 2 }, summary: 'choose', decision: 'OWNER_DECISION' };
  assert.equal(digestDecision(first), digestDecision(reordered));
  assert.match(digestDecision(first), /^[a-f0-9]{64}$/);
  const report = renderReport(
    { conclusion: 'OWNER_DECISION', summary: 'choose', decision: first },
    { headSha: 'head123' },
  );
  assert.match(report, /not accepted by the current run/);
  assert.match(report, /canonical consumer-owned authority/);
  assert.match(report, /rerun the gate/);
  assert.match(report, /owner-intervention\.md#owner_decision/);
  assert.match(report, /PR head: `head123`/);
  assert.match(report, /Decision SHA-256: `[a-f0-9]{64}`/);
  assert.doesNotMatch(report, /environment/i);
});

test('links generic errors to cause inspection and conditional CI-unavailable guidance', () => {
  const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'failure' });
  const report = renderReport(classified, { runUrl: 'https://github.com/o/r/actions/runs/1' });
  assert.match(report, /Inspect the \[Actions run\]/);
  assert.match(report, /owner-intervention\.md#ci-review-unavailable/);
  assert.match(report, /If the CI reviewer is unavailable/);
  assert.match(report, /not a PASS/);
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

test('complete selected Authority Set provenance precedes truncated optional review details', () => {
  const members = Array.from({ length: 16 }, (_, index) => ({
    id: `source-${index}`, repository: 'flair-agency/test', resolvedCommit: 'a'.repeat(40),
    path: `docs/source-${index}.md`, sha256: 'b'.repeat(64),
  }));
  const selected = { manifestSha256: 'c'.repeat(64), setDigest: 'd'.repeat(64), members };
  const large = { decision: 'PASS', summary: 'ok', authorityIds: members.map(member => member.id),
    reviewedScope: Array.from({ length: 100 }, (_, index) => `${index}-${'x'.repeat(3_000)}`) };
  const report = renderReport({ conclusion: 'PASS', summary: 'ok', decision: large }, { authorityProvenance: selected });
  assert.match(report, /Selected Authority Set/);
  assert.match(report, /source-15: flair-agency\/test@/);
  assert.match(report, /Set SHA-256: `dddd/);
  assert.match(report, /Report truncated/);
  assert.ok(report.length <= 60_000);
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
