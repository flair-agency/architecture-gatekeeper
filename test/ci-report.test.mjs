import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMENT_MARKER, classifyReview, digestDecision, formatInlineFindingHeading, parseLegacyAuthorityProvenance, postInlineReview, renderReport, sanitizeReportApiContext, upsertPullRequestComment, validateInlineFindings } from '../dist/ci-report.mjs';

test('sanitizes report API context to GitHub.com and canonical PR identity', () => {
  assert.deepEqual(sanitizeReportApiContext({ apiUrl: 'https://api.github.com/', repository: 'flair-agency/architecture-gatekeeper',
    pullRequest: '000191', expectedHead: 'a'.repeat(40) }), {
    apiUrl: 'https://api.github.com', repository: 'flair-agency/architecture-gatekeeper', pullRequest: '191', expectedHead: 'a'.repeat(40),
  });
  for (const context of [
    { apiUrl: 'https://attacker.example', repository: 'o/r', pullRequest: '1', expectedHead: 'a'.repeat(40) },
    { apiUrl: 'https://api.github.com.evil/', repository: 'o/r', pullRequest: '1', expectedHead: 'a'.repeat(40) },
    { apiUrl: 'https://user@api.github.com/', repository: 'o/r', pullRequest: '1', expectedHead: 'a'.repeat(40) },
    { apiUrl: 'https://api.github.com/repos/o/r', repository: 'o/r', pullRequest: '1', expectedHead: 'a'.repeat(40) },
    { apiUrl: 'https://api.github.com', repository: 'o/r?x=evil', pullRequest: '1', expectedHead: 'a'.repeat(40) },
    { apiUrl: 'https://api.github.com', repository: 'o/r', pullRequest: '1/../../x', expectedHead: 'a'.repeat(40) },
    { apiUrl: 'https://api.github.com', repository: 'o/r', pullRequest: '1', expectedHead: 'A'.repeat(40) },
  ]) assert.throws(() => sanitizeReportApiContext(context));
});

test('legacy provenance binds base/head, policy and selected authority in report', () => {
  const provenance = { version: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedSha: '2'.repeat(40),
    policy: { path: '.codex/gatekeeper/ci-policy.json', sha256: 'c'.repeat(64) },
    prompt: { path: '.codex/gatekeeper/review.prompt', sha256: 'e'.repeat(64) },
    schema: { path: '.codex/gatekeeper/decision.schema.json', sha256: 'f'.repeat(64) },
    validation: { path: '.codex/gatekeeper/decision.validation.json', sha256: '1'.repeat(64) },
    members: [{ path: 'docs/architecture', sha256: 'd'.repeat(64) }] };
  const parsed = parseLegacyAuthorityProvenance(Buffer.from(JSON.stringify(provenance)).toString('base64'), true);
  assert.deepEqual(parsed, provenance);
  const report = renderReport({ conclusion: 'PASS', summary: 'Existing authority permits the change.', decision: {
    decision: 'PASS', summary: 'Existing authority permits the change.', authorityFiles: ['docs/architecture'],
  } }, { legacyAuthorityProvenance: parsed, repository: 'flair-agency/architecture-gatekeeper' });
  assert.match(report, /Recorded-base legacy review inputs/);
  assert.match(report, /Base: \[`a{12}`\]\(https:\/\/github\.com\/flair-agency\/architecture-gatekeeper\/commit\/a{40}\)/);
  assert.match(report, /Candidate head: \[`b{12}`\]\(https:\/\/github\.com\/flair-agency\/architecture-gatekeeper\/commit\/b{40}\)/);
  assert.match(report, /Reviewed merge: \[`2{12}`\]\(https:\/\/github\.com\/flair-agency\/architecture-gatekeeper\/commit\/2{40}\)/);
  assert.match(report, /##### Full commit IDs[\s\S]*Base: `a{40}` · Candidate head: `b{40}` · Reviewed merge: `2{40}`/);
  assert.match(report, /Reviewed merge: `2{40}`/);
  assert.match(report, /\.codex\/gatekeeper\/review\.prompt \(SHA-256 e{64}\)/);
  assert.match(report, /\.codex\/gatekeeper\/decision\.schema\.json \(SHA-256 f{64}\)/);
  assert.match(report, /\.codex\/gatekeeper\/decision\.validation\.json \(SHA-256 1{64}\)/);
  assert.match(report, /docs\/architecture \(SHA-256 d{64}\)/);
  assert.throws(() => parseLegacyAuthorityProvenance(Buffer.from(JSON.stringify({ ...provenance,
    schema: { ...provenance.schema, path: '../outside.json' } })).toString('base64'), true), /Invalid legacy/);
  assert.throws(() => parseLegacyAuthorityProvenance('', true), /Missing legacy/);
  assert.throws(() => parseLegacyAuthorityProvenance(Buffer.from(JSON.stringify({ ...provenance, members: [] })).toString('base64'), true), /Invalid legacy/);
});

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

test('uses reviewer-first headings and the shared icon-plus-label vocabulary in gate results', () => {
  const report = renderReport({ conclusion: 'BLOCK', summary: 'review', decision: {
    decision: 'BLOCK', findings: [{ title: 'Fix boundary', body: 'Details', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } }],
    gates: {
      accepted: { decision: 'PASS', summary: 'ok' },
      blocked: { decision: 'BLOCK', summary: 'needs work' },
      owner: { decision: 'OWNER_DECISION', summary: 'choose' },
      failed: { decision: 'ERROR', summary: 'review failed' },
      skipped: { applicable: false, summary: 'not needed' },
      malformed: { summary: 'diagnostic is incomplete' },
    },
  } });
  assert.ok(report.indexOf('### Findings') < report.indexOf('### Gate results'));
  assert.match(report, /\| accepted \| ✅ PASS \|/);
  assert.match(report, /\| blocked \| 🛑 BLOCK \|/);
  assert.match(report, /\| owner \| ⚠️ OWNER DECISION REQUIRED \|/);
  assert.match(report, /\| failed \| ❌ REVIEW FAILED \|/);
  assert.match(report, /\| skipped \| ➖ NOT APPLICABLE \|/);
  assert.match(report, /\| malformed \| ❓ UNKNOWN \|/);
});

test('links short Git commit IDs and keeps full IDs recoverable in run metadata', () => {
  const reviewedSha = 'a'.repeat(40);
  const headSha = 'b'.repeat(40);
  const report = renderReport({ conclusion: 'PASS', summary: 'ok', decision: { decision: 'PASS' } }, {
    repository: 'flair-agency/architecture-gatekeeper', reviewedSha, headSha,
  });
  assert.match(report, /Reviewed commit: \[`a{12}`\]\(https:\/\/github\.com\/flair-agency\/architecture-gatekeeper\/commit\/a{40}\)/);
  assert.match(report, /PR head: \[`b{12}`\]\(https:\/\/github\.com\/flair-agency\/architecture-gatekeeper\/commit\/b{40}\)/);
  assert.match(report, /<summary>Full commit IDs<\/summary>[\s\S]*Reviewed commit: `a{40}`[\s\S]*PR head: `b{40}`/);
  assert.ok(report.indexOf('### Gate results') === -1);
  assert.match(report, /### Run metadata/);
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
  assert.match(report, /adoption and canonical placement: `pending`/);
  assert.match(report, /principal authentication and host enforcement: `not_verified`/);
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
  assert.match(report, /<\/details>\n+_Report truncated\./);
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

test('truncation retains max finding essentials, full gate table, and long required provenance', () => {
  const members = Array.from({ length: 32 }, (_, index) => ({
    id: `source-${String(index).padStart(2, '0')}`, repository: `flair-agency/authority-${String(index).padStart(2, '0')}`,
    resolvedCommit: index.toString(16).padStart(40, 'a'), path: `docs/${'d'.repeat(180)}-${index}.md`, sha256: index.toString(16).padStart(64, 'b'),
  }));
  const selected = { manifestSha256: 'c'.repeat(64), setDigest: 'e'.repeat(64), members };
  const findings = Array.from({ length: 20 }, (_, index) => ({
    title: `Finding ${String(index).padStart(2, '0')} ${'t'.repeat(200 - `Finding ${String(index).padStart(2, '0')} `.length)}`,
    body: 'reviewer explanation '.repeat(150),
    location: { path: `src/${'p'.repeat(232 - String(index).length)}${index}.mjs`, line: index + 3, side: 'RIGHT' },
  }));
  const inlineDelivery = { status: 'created', checked: findings.map((_, index) => ({ index, valid: true,
    commentUrl: `https://github.com/flair-agency/architecture-gatekeeper/pull/208#discussion_r${9000 + index}` })) };
  const decision = { decision: 'BLOCK', summary: 'review', findings,
    reviewedScope: Array.from({ length: 80 }, (_, index) => `${index}: ${'reviewed scope '.repeat(120)}`),
    gates: {
      sharedMechanism: { decision: 'BLOCK', summary: 'shared mechanism is blocked' },
      trustBoundary: { decision: 'OWNER_DECISION', summary: 'owner must decide' },
    } };
  const report = renderReport({ conclusion: 'BLOCK', summary: 'review', decision }, {
    authorityProvenance: selected, inlineDelivery, reviewedSha: 'f'.repeat(40),
    repository: 'flair-agency/architecture-gatekeeper', runUrl: 'https://github.com/flair-agency/architecture-gatekeeper/actions/runs/208',
  });
  assert.ok(report.length <= 60_000);
  assert.match(report, /Report truncated/);
  assert.match(report, /### Findings/);
  assert.match(report, /### Gate results[\s\S]*\| sharedMechanism \| 🛑 BLOCK \| shared mechanism is blocked \|[\s\S]*\| trustBoundary \| ⚠️ OWNER DECISION REQUIRED \| owner must decide \|/);
  for (let index = 0; index < findings.length; index += 1) {
    assert.ok(report.includes(`**${findings[index].title}**`));
    assert.equal(findings[index].title.length, 200);
    assert.equal(findings[index].location.path.length, 240);
    assert.ok(report.includes(`${findings[index].location.path}:${index + 3} RIGHT`));
    assert.ok(report.includes(`#discussion_r${9000 + index}`));
  }
  assert.ok(report.includes(selected.manifestSha256));
  assert.ok(report.includes(selected.setDigest));
  for (const member of members) assert.ok(report.includes(member.sha256));
  assert.match(report, /Reviewed commit: `f{40}`/);
  assert.match(report, /actions\/runs\/208/);
  assert.match(report, /<\/details>\n+_Report truncated\./);
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

test('paginates fixed comment endpoint and ignores response-provided Link URLs', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => Array.from({ length: 100 }, (_, id) => ({ id, user: { login: 'someone' }, body: 'ordinary comment' })),
        headers: { get: () => '<https://attacker.invalid/steal-token?page=2>; rel="next", <https://attacker.invalid/steal-token?page=9>; rel="last"' },
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
  assert.match(calls[0].url, /^https:\/\/api\.test\/repos\/o\/r\/issues\/7\/comments\?per_page=100&page=1$/);
  assert.match(calls[1].url, /^https:\/\/api\.test\/repos\/o\/r\/issues\/7\/comments\?per_page=100&page=2$/);
  assert.doesNotMatch(calls.map(call => call.url).join('\n'), /attacker\.invalid/);
  assert.match(calls[2].url, /issues\/comments\/101$/);
});

test('skips comments without write context and reports API failures to the caller', async () => {
  assert.equal((await upsertPullRequestComment({})).status, 'skipped');
  await assert.rejects(
    upsertPullRequestComment({ fetchImpl: async () => ({ ok: false, status: 403 }), apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token', body: 'x' }),
    /HTTP 403/,
  );
});

const inlinePatch = '@@ -3,0 +4,2 @@\n+const added = true;\n+return added;';
const deletedPatch = '@@ -3,2 +3,0 @@\n-old value;\n-obsolete();';

test('formats inline comment headings by decision with a branded safe fallback', () => {
  assert.equal(formatInlineFindingHeading('BLOCK', 'Issue'), '🛑 BLOCK — Architecture Gatekeeper — Issue');
  assert.equal(formatInlineFindingHeading('OWNER_DECISION', 'Issue'), '⚠️ OWNER_DECISION — Architecture Gatekeeper — Issue');
  assert.equal(formatInlineFindingHeading('PASS', 'Issue'), 'Architecture Gatekeeper — Issue');
  assert.equal(formatInlineFindingHeading(undefined, 'Issue'), 'Architecture Gatekeeper — Issue');
});

test('validates inline locations only on added diff lines and bounds findings', () => {
  const findings = [
    { title: 'Added-line issue', body: 'Fix this.', location: { path: 'src/a.mjs', line: 5, side: 'RIGHT' } },
    { title: 'Context-line issue', body: 'Not changed.', location: { path: 'src/a.mjs', line: 3, side: 'RIGHT' } },
    { title: 'Unlocated', body: 'Keep in summary.' },
    { title: 'Traversal', body: 'Invalid.', location: { path: '../secret', line: 4, side: 'RIGHT' } },
  ];
  const checked = validateInlineFindings(findings, { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40),
    files: [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] });
  assert.deepEqual(checked.map(item => item.valid), [true, false, false, false]);
  assert.match(checked[1].reason, /added line/);
  assert.match(checked[2].reason, /no inline location/);
  assert.equal(validateInlineFindings(Array.from({ length: 25 }, (_, index) => ({ title: `Finding ${index}`, body: 'x' })),
    { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40), files: [] }).length, 20);
  assert.equal(validateInlineFindings([{ title: 'x'.repeat(201), body: 'too long' }],
    { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40), files: [] })[0].reason, 'invalid finding text');
  const deletion = validateInlineFindings([{ title: 'Removed behavior', body: 'This removal breaks callers.',
    location: { path: 'src/deleted.mjs', line: 4, side: 'LEFT' } }],
  { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40), files: [{ filename: 'src/deleted.mjs', additions: 0, deletions: 2, patch: deletedPatch }] });
  assert.equal(deletion[0].valid, true);
  for (const file of [
    { filename: 'src/a.mjs', status: 'renamed', previous_filename: 'src/b.mjs', additions: 2, deletions: 0, patch: inlinePatch },
    { filename: 'src/a.mjs', status: 'modified', additions: 0, deletions: 0 },
    { filename: 'src/a.mjs', additions: 2, deletions: 0, patch: '@@ -3,2 +4,2 @@\n+truncated' },
  ]) {
    const result = validateInlineFindings([{ title: 'Issue', body: 'Details',
      location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } }],
    { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40), files: [file] });
    assert.equal(result[0].valid, false);
    assert.match(result[0].reason, /renamed|missing or binary|truncated/);
  }
  const omittedLaterHunk = validateInlineFindings([{ title: 'Issue', body: 'Details',
    location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } }],
  { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40), files: [{ filename: 'src/a.mjs', additions: 2, deletions: 0,
    patch: '@@ -3,0 +4,1 @@\n+first hunk' }] });
  assert.equal(omittedLaterHunk[0].valid, false);
  assert.match(omittedLaterHunk[0].reason, /incomplete or truncated relative to API file counts/);
  const absentCounts = validateInlineFindings([{ title: 'Issue', body: 'Details',
    location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } }],
  { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40), files: [{ filename: 'src/a.mjs', patch: inlinePatch }] });
  assert.match(absentCounts[0].reason, /counts are missing or invalid/);
  assert.equal(validateInlineFindings(findings, { expectedHead: 'a'.repeat(40), currentHead: 'b'.repeat(40),
    files: [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] })[0].reason, 'pull request head changed during reporting');
});

test('posts one COMMENT review and skips already posted same-head findings', async () => {
  const calls = [];
  const findings = [
    { title: 'Added-line issue', body: 'Fix this.', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } },
    { title: 'Deleted-line issue', body: 'Restore this.', location: { path: 'src/deleted.mjs', line: 4, side: 'LEFT' } },
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/pulls/7')) return { ok: true, json: async () => ({ head: { sha: 'a'.repeat(40) } }) };
    if (url.includes('/files?')) return { ok: true, json: async () => [
      { filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch },
      { filename: 'src/deleted.mjs', additions: 0, deletions: 2, patch: deletedPatch },
    ] };
    if (url.includes('/comments?')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => ({}) };
  };
  const result = await postInlineReview({ fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7',
    token: 'token', expectedHead: 'a'.repeat(40), findings });
  assert.equal(result.status, 'created');
  const submission = calls.findLast(call => call.options.method === 'POST');
  assert.match(submission.url, /pulls\/7\/reviews$/);
  const payload = JSON.parse(submission.options.body);
  assert.equal(payload.event, 'COMMENT');
  assert.equal(payload.commit_id, 'a'.repeat(40));
  assert.equal(payload.comments.length, 2);
  assert.equal(payload.comments[0].side, 'RIGHT');
  assert.equal(payload.comments[1].side, 'LEFT');
  assert.equal(payload.comments[1].line, 4);
  assert.match(payload.comments[0].body, /Architecture Gatekeeper/);
  assert.match(payload.comments[0].body, /architecture-gatekeeper:inline:v1:/);
});

test('falls back on stale head and deduplicates matching review comments', async () => {
  let stale = true;
  const finding = { title: 'Issue', body: 'Explanation', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } };
  const digest = validateInlineFindings([finding], { expectedHead: 'a'.repeat(40), currentHead: 'a'.repeat(40),
    files: [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] })[0].key;
  const fetchImpl = async (url) => {
    if (url.endsWith('/pulls/7')) return { ok: true, json: async () => ({ head: { sha: stale ? 'b'.repeat(40) : 'a'.repeat(40) } }) };
    if (url.includes('/files?')) return { ok: true, json: async () => [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] };
    if (url.includes('/comments?')) return { ok: true, json: async () => [{ user: { login: 'github-actions[bot]' }, commit_id: 'a'.repeat(40), html_url: 'https://github.com/o/r/pull/7#discussion_r81', body: `comment ${'<!-- architecture-gatekeeper:inline:v1:' + digest + ' -->'}` }] };
    throw new Error('unexpected write');
  };
  const args = { fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token', expectedHead: 'a'.repeat(40), findings: [finding] };
  assert.equal((await postInlineReview(args)).status, 'fallback');
  stale = false;
  const unchanged = await postInlineReview(args);
  assert.equal(unchanged.status, 'unchanged');
  assert.equal(unchanged.checked[0].commentUrl, 'https://github.com/o/r/pull/7#discussion_r81');
});

test('created inline comments identify the product and render GitHub-returned direct links', async () => {
  const head = 'a'.repeat(40);
  const finding = { title: 'Issue', body: 'Explanation', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } };
  let findingKey;
  let commentsReads = 0;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body);
      assert.ok(payload.comments[0].body.startsWith('**🛑 BLOCK — Architecture Gatekeeper — Issue**'));
      findingKey = payload.comments[0].body.match(/architecture-gatekeeper:inline:v1:([a-f0-9]{64})/)[1];
      return { ok: true };
    }
    if (url.endsWith('/pulls/7')) return { ok: true, json: async () => ({ head: { sha: head } }) };
    if (url.includes('/files?')) return { ok: true, json: async () => [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] };
    if (url.includes('/comments?')) {
      commentsReads += 1;
      if (commentsReads === 1) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => [{ user: { login: 'github-actions[bot]' }, commit_id: head,
        html_url: 'https://github.com/o/r/pull/7#discussion_r82', body: `**Architecture Gatekeeper** <!-- architecture-gatekeeper:inline:v1:${findingKey} -->` }] };
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const delivery = await postInlineReview({ fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7',
    token: 'token', expectedHead: head, decision: 'BLOCK', findings: [finding] });
  assert.equal(delivery.status, 'created');
  assert.equal(delivery.checked[0].commentUrl, 'https://github.com/o/r/pull/7#discussion_r82');
  const report = renderReport({ conclusion: 'BLOCK', summary: 'review', decision: { decision: 'BLOCK', findings: [finding] } },
    { inlineDelivery: delivery });
  assert.match(report, /### Findings[\s\S]*\*\*Issue\*\* — `src\/a\.mjs:4 RIGHT`/);
  assert.match(report, /\[inline comment\]\(https:\/\/github\.com\/o\/r\/pull\/7#discussion_r82\)/);
});

test('retains successful inline post status when the follow-up URL lookup fails', async () => {
  let postCount = 0;
  let commentsReads = 0;
  const finding = { title: 'Issue', body: 'Explanation', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } };
  const delivery = await postInlineReview({ apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token',
    expectedHead: 'a'.repeat(40), findings: [finding], fetchImpl: async (url, options = {}) => {
      if (options.method === 'POST') { postCount += 1; return { ok: true }; }
      if (url.endsWith('/pulls/7')) return { ok: true, json: async () => ({ head: { sha: 'a'.repeat(40) } }) };
      if (url.includes('/files?')) return { ok: true, json: async () => [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] };
      if (url.includes('/comments?')) {
        commentsReads += 1;
        return commentsReads === 1 ? { ok: true, json: async () => [] } : { ok: false, status: 503 };
      }
      throw new Error(`unexpected URL ${url}`);
    } });
  assert.equal(postCount, 1);
  assert.equal(delivery.status, 'created');
  assert.match(delivery.linkWarning, /links could not be retrieved/);
  const report = renderReport({ conclusion: 'BLOCK', summary: 'review', decision: { decision: 'BLOCK', findings: [finding] } },
    { inlineDelivery: delivery });
  assert.match(report, /Inline review status: created; review posted, but inline comment links could not be retrieved/);
  assert.match(report, /direct link unavailable/);
});

test('forged or stale-head markers from non-Actions comments do not suppress a review', async () => {
  const head = 'a'.repeat(40);
  const finding = { title: 'Issue', body: 'Explanation', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } };
  const key = validateInlineFindings([finding], { expectedHead: head, currentHead: head,
    files: [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] })[0].key;
  const posted = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') { posted.push(JSON.parse(options.body)); return { ok: true }; }
    if (url.endsWith('/pulls/7')) return { ok: true, json: async () => ({ head: { sha: head } }) };
    if (url.includes('/files?')) return { ok: true, json: async () => [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] };
    if (url.includes('/comments?')) return { ok: true, json: async () => [
      { user: { login: 'pull-request-author' }, commit_id: head, body: `<!-- architecture-gatekeeper:inline:v1:${key} -->` },
      { user: { login: 'github-actions[bot]' }, commit_id: 'b'.repeat(40), body: `<!-- architecture-gatekeeper:inline:v1:${key} -->` },
    ] };
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await postInlineReview({ fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7',
    token: 'token', expectedHead: head, findings: [finding] });
  assert.equal(result.status, 'created');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].comments.length, 1);
});

test('finding markers ignore location property insertion order across reruns', () => {
  const expectedHead = 'a'.repeat(40);
  const first = { title: 'Issue', body: 'Explanation', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } };
  const reordered = { title: 'Issue', body: 'Explanation', location: { side: 'RIGHT', line: 4, path: 'src/a.mjs' } };
  const options = { expectedHead, currentHead: expectedHead, files: [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] };
  assert.equal(validateInlineFindings([first], options)[0].key, validateInlineFindings([reordered], options)[0].key);
});

test('finding identity changes with decision while same-decision reruns remain idempotent', async () => {
  const head = 'a'.repeat(40);
  const finding = { title: 'Issue', body: 'Explanation', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } };
  const comments = [];
  const submissions = [];
  let nextCommentId = 1;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body);
      submissions.push(payload);
      for (const comment of payload.comments) comments.push({ user: { login: 'github-actions[bot]' }, commit_id: head,
        html_url: `https://github.com/o/r/pull/7#discussion_r${nextCommentId++}`, body: comment.body });
      return { ok: true };
    }
    if (url.endsWith('/pulls/7')) return { ok: true, json: async () => ({ head: { sha: head } }) };
    if (url.includes('/files?')) return { ok: true, json: async () => [
      { filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch },
    ] };
    if (url.includes('/comments?')) return { ok: true, json: async () => comments };
    throw new Error(`unexpected URL ${url}`);
  };
  const args = { fetchImpl, apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token',
    expectedHead: head, findings: [finding] };

  const block = await postInlineReview({ ...args, decision: 'BLOCK' });
  const repeatedBlock = await postInlineReview({ ...args, decision: 'BLOCK' });
  const ownerDecision = await postInlineReview({ ...args, decision: 'OWNER_DECISION' });

  assert.equal(block.status, 'created');
  assert.equal(repeatedBlock.status, 'unchanged');
  assert.equal(ownerDecision.status, 'created');
  assert.equal(submissions.length, 2);
  assert.match(submissions[0].comments[0].body, /🛑 BLOCK —/);
  assert.match(submissions[1].comments[0].body, /⚠️ OWNER_DECISION —/);
});

test('rechecks PR head immediately before POST and renders delivery plus deferral in report', async () => {
  let reads = 0;
  let writes = 0;
  const finding = { title: 'Issue', body: 'Explanation', location: { path: 'src/a.mjs', line: 4, side: 'RIGHT' } };
  const result = await postInlineReview({
    apiUrl: 'https://api.test', repository: 'o/r', pullRequest: '7', token: 'token', expectedHead: 'a'.repeat(40),
    findings: [finding],
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'POST') { writes += 1; return { ok: true }; }
      if (url.endsWith('/pulls/7')) {
        reads += 1;
        return { ok: true, json: async () => ({ head: { sha: reads === 1 ? 'a'.repeat(40) : 'b'.repeat(40) } }) };
      }
      if (url.includes('/files?')) return { ok: true, json: async () => [{ filename: 'src/a.mjs', additions: 2, deletions: 0, patch: inlinePatch }] };
      if (url.includes('/comments?')) return { ok: true, json: async () => [] };
      throw new Error('unexpected request');
    },
  });
  assert.equal(writes, 0);
  assert.equal(result.status, 'fallback');
  assert.match(result.checked[0].reason, /immediately before/);
  const report = renderReport({ conclusion: 'BLOCK', summary: 'review', decision: { decision: 'BLOCK', findings: [finding] } },
    { inlineDelivery: result });
  assert.match(report, /### Findings/);
  assert.doesNotMatch(report, /Verified findings/);
  assert.match(report, /Inline review status: fallback:/);
  assert.match(report, /deferred: pull request head changed immediately before inline review creation/);
});
