import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOwnerAmendmentHandoffPrRunContext } from '../dist/owner-amendment-handoff-pr-run-context.mjs';
import { inspectOwnerAmendmentSelfScope } from '../dist/owner-amendment-scope.mjs';

test('PR context preserves a later base SHA observation rather than promising a checked string', async () => {
  const repository = 'owner/repo';
  const baseSha = 'a'.repeat(40), aHead = 'b'.repeat(40), bHead = 'c'.repeat(40);
  const repo = { id: 7, full_name: repository };
  const laterObservation = { observation: 'changed after checks' };
  let baseReads = 0;
  const bPr = { number: 2, state: 'open', draft: false,
    base: { ref: 'main', repo, get sha() { return ++baseReads <= 2 ? baseSha : laterObservation; } },
    head: { sha: bHead, repo } };
  const aPr = { number: 1, merged: false, merged_at: null,
    base: { ref: 'main', sha: baseSha, repo }, head: { sha: aHead, repo } };
  const run = { id: 3, run_attempt: 1, status: 'completed', event: 'pull_request_target',
    path: '.github/workflows/self-architecture-gate.yml', repository: repo,
    head_repository: repo, head_sha: aHead, pull_requests: [] };
  const requested = [];
  const result = await selectOwnerAmendmentHandoffPrRunContext({
    input: { repository, bPrNumber: 2, aPrNumber: 1, runId: 3, runAttempt: 1 }, token: 'fixture',
    fetchImpl: url => {
      requested.push(url);
      const value = url.endsWith('/pulls/2') ? bPr : url.endsWith('/pulls/1') ? aPr : run;
      return { ok: true, json: () => value };
    },
  });
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT');
  assert.equal(result.baseSha, laterObservation);
  assert.equal(baseReads, 3);
  assert.equal(requested.length, 3);
});

test('scope retains SHA regexp coercion and returns the original observation', () => {
  const observedBase = { toString: () => 'a'.repeat(40) };
  const result = inspectOwnerAmendmentSelfScope({
    policy: { ownerAmendmentVersion: 1, ownerAmendmentGrade: 'G0', ownerAmendmentScope: 'authority-only',
      ownerAmendmentTriggerProfile: 'completed-block-v1', ownerAmendmentAuthorityId: 'self',
      ownerAmendmentAuthorityPath: 'docs/architecture.md' },
    manifest: { version: 1, authorities: [{ id: 'self', path: 'docs/architecture.md',
      repository: 'self', revision: 'authority-revision' }] },
    baseSha: observedBase, headSha: 'b'.repeat(40),
    changedFiles: [{ path: 'docs/architecture.md', status: 'modified' }],
    baseAuthorityBytes: Buffer.from('before'), headAuthorityBytes: Buffer.from('after'),
  });
  assert.equal(result.baseSha, observedBase);
  assert.match(result.previousSha256, /^[a-f0-9]{64}$/);
  assert.match(result.newSha256, /^[a-f0-9]{64}$/);
});
