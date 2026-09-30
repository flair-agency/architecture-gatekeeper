import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyOwnerAmendmentTagAttempt } from '../src/owner-amendment-tag-attempt.mjs';
import { assertEnforcedAcceptance } from '../src/ci-enforced-acceptance.mjs';
import { inspectOwnerAmendmentSelfScope } from '../src/owner-amendment-scope.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40);
const bSha = 'b'.repeat(40);
const triggerProfile = 'completed-block-v1';
const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
  mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
  authorityManifestPath: '.codex/gatekeeper/authorities.json',
  authorityLimits: { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 73_728,
    maxTotalBytes: 262_144, maxPromptBytes: 524_288 },
  ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile,
    authorityId: 'architecture-contract', authorityPath: 'docs/architecture.md',
    evidenceProducer: 'github-actions-attestation',
    tagNamespace: 'refs/tags/architecture-gatekeeper/amendments', maxPromptBytes: 262_144 },
} } };
const policyBytes = Buffer.from(JSON.stringify(policy));
const context = { repository, baseSha, bSha, baseBranch: 'main', triggerProfile, policyBytes };

test('protected exact-B tag classification distinguishes only the exact absent ref from an attempted amendment', async () => {
  const seen = [];
  const absent = await classifyOwnerAmendmentTagAttempt({ ...context, readTagRef: async request => {
    seen.push(request);
    return { status: 404, requestedUrl: request.expectedUrl };
  } });
  assert.deepEqual(absent, { status: 'OWNER_AMENDMENT_NOT_APPLICABLE', attempted: false, tagRef: null });
  const present = await classifyOwnerAmendmentTagAttempt({ ...context, readTagRef: async request => {
    seen.push(request);
    return { status: 200, requestedUrl: request.expectedUrl };
  } });
  assert.deepEqual(present, { status: 'OWNER_AMENDMENT_ATTEMPT', attempted: true,
    tagRef: `${policy.branches.main.ownerAmendment.tagNamespace}/${bSha}` });
  assert.match(seen[1].expectedUrl, new RegExp(`${bSha}$`));
  assert.equal(seen[0].tagNamespace, policy.branches.main.ownerAmendment.tagNamespace);
  assert.equal(seen[1].bSha, bSha);
  await assert.rejects(classifyOwnerAmendmentTagAttempt({ ...context, readTagRef: async request =>
    ({ status: 503, requestedUrl: request.expectedUrl }) }), /unexpected HTTP status 503/);
  await assert.rejects(classifyOwnerAmendmentTagAttempt({ ...context, readTagRef: async () =>
    ({ status: 404, requestedUrl: 'https://attacker.invalid/ref' }) }), /does not match the exact protected self ref/);
});

test('tagged out-of-scope workflow amendment cannot fall through to ordinary PASS', async () => {
  const attempt = await classifyOwnerAmendmentTagAttempt({ ...context,
    readTagRef: async request => ({ status: 200, requestedUrl: request.expectedUrl }) });
  const amendmentPolicy = { ownerAmendmentVersion: 1, ownerAmendmentGrade: 'G0',
    ownerAmendmentScope: 'authority-only', ownerAmendmentTriggerProfile: triggerProfile,
    ownerAmendmentAuthorityId: 'architecture-contract', ownerAmendmentAuthorityPath: 'docs/architecture.md' };
  const manifest = { version: 1, authorities: [{ id: 'architecture-contract', repository: 'self',
    revision: 'authority-revision', path: 'docs/architecture.md' }] };
  assert.throws(() => inspectOwnerAmendmentSelfScope({ policy: amendmentPolicy, manifest, baseSha, headSha: bSha,
    changedFiles: [{ path: 'docs/architecture.md', status: 'modified' },
      { path: '.github/workflows/self-architecture-gate.yml', status: 'modified' }],
    baseAuthorityBytes: Buffer.from('old\n'), headAuthorityBytes: Buffer.from('new\n') }),
  /exactly the selected self authority member/);
  assert.throws(() => assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS',
    ownerAmendmentSelected: 'G0', ownerAmendmentAttemptResult: 'success',
    ownerAmendmentAttempted: String(attempt.attempted), ownerAmendmentSignerResult: 'failure',
    ownerAmendmentSignerStatus: '', ownerAmendmentEligibility: '' }), /tagged OWNER_AMENDMENT attempt requires/);
});

test('ordinary PASS remains available when protected exact-B classification confirms no tag', async () => {
  const attempt = await classifyOwnerAmendmentTagAttempt({ ...context,
    readTagRef: async request => ({ status: 404, requestedUrl: request.expectedUrl }) });
  assert.deepEqual(assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS',
    ownerAmendmentSelected: 'G0', ownerAmendmentAttemptResult: 'success',
    ownerAmendmentAttempted: String(attempt.attempted) }), { route: 'ordinary-pass' });
  assert.throws(() => assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS',
    ownerAmendmentSelected: 'G0', ownerAmendmentAttemptResult: 'failure', ownerAmendmentAttempted: '' }),
  /attempt classification is unavailable/);
});
