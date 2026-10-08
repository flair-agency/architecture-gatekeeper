import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOwnerAmendmentTagAbsentAtAcceptance, classifyOwnerAmendmentTagAttempt } from '../dist/owner-amendment-tag-attempt.mjs';
import { assertEnforcedAcceptance } from '../dist/ci-enforced-acceptance.mjs';
import { inspectOwnerAmendmentSelfScope } from '../dist/owner-amendment-scope.mjs';

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

test('malformed scalar tag readback responses retain the exact-ref error', async () => {
  for (const response of [null, 7, 'malformed']) {
    await assert.rejects(classifyOwnerAmendmentTagAttempt({ ...context, readTagRef: async () => response }),
      /does not match the exact protected self ref request/);
  }
});

test('tagged amendment eligibility cannot fall through to an unimplemented acceptance route', async () => {
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
  assert.throws(() => assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'OWNER_ADDITION_G0',
    ownerAdditionSelected: 'G0', ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE',
    ownerAmendmentSelected: 'G0', ownerAmendmentAttemptResult: 'success',
    ownerAmendmentAttempted: String(attempt.attempted), ownerAmendmentSignerResult: 'failure' }),
  /tagged OWNER_AMENDMENT attempt requires/);
  for (const conclusion of ['PASS', 'BLOCK', 'OWNER_DECISION', 'OWNER_ADDITION_G0']) {
    assert.throws(() => assertEnforcedAcceptance({ reviewResult: 'success', conclusion,
      ownerAdditionSelected: 'G0', ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE',
      ownerAmendmentSelected: 'G0', ownerAmendmentAttemptResult: 'success',
      ownerAmendmentAttempted: String(attempt.attempted), ownerAmendmentSignerResult: 'success',
      ownerAmendmentSignerStatus: 'prepared', ownerAmendmentEligibility: 'ELIGIBLE' }),
    /eligible tagged OWNER_AMENDMENT requires a separately implemented protected transition route/);
  }
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
  assert.throws(() => assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'OWNER_ADDITION_G0',
    ownerAdditionSelected: 'G0', ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE',
    ownerAmendmentSelected: 'G0', ownerAmendmentAttemptResult: 'success',
    ownerAmendmentAttempted: String(attempt.attempted), ownerAmendmentSignerResult: 'success',
    ownerAmendmentSignerStatus: 'prepared', ownerAmendmentEligibility: 'ELIGIBLE' }),
  /conflicts with the protected no-tag classification/);
});

test('final acceptance re-reads the exact B tag and rejects a tag created after the initial 404', async () => {
  const responses = [404, 200];
  const readTagRef = async request => ({ status: responses.shift(), requestedUrl: request.expectedUrl });
  const initial = await classifyOwnerAmendmentTagAttempt({ ...context, readTagRef });
  assert.equal(initial.attempted, false);
  await assert.rejects(assertOwnerAmendmentTagAbsentAtAcceptance({ ...context, readTagRef }),
    /tag is present at final acceptance/);
  assert.deepEqual(responses, []);
});

test('final acceptance fails closed when the exact B tag re-read is unavailable', async () => {
  await assert.rejects(assertOwnerAmendmentTagAbsentAtAcceptance({ ...context, readTagRef: async request =>
    ({ status: 503, requestedUrl: request.expectedUrl }) }), /unexpected HTTP status 503/);
});

test('legacy OWNER_ADDITION_G0 acceptance remains unchanged', () => {
  assert.deepEqual(assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'OWNER_ADDITION_G0',
    ownerAdditionSelected: 'G0', ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE' }),
  { route: 'owner-addition-pending' });
});

// Awaited reader timing is independent of the exact-ref response validation.
test('tag reader accepts immediate, Promise and minimal thenable responses', async () => {
  for (const wrap of [value => value, value => Promise.resolve(value),
    value => ({ then(resolve) { resolve(value); } })]) {
    const seen = [];
    const readTagRef = request => {
      seen.push(request);
      return wrap({ status: 404, requestedUrl: request.expectedUrl });
    };
    const first = await classifyOwnerAmendmentTagAttempt({ ...context, readTagRef });
    const final = await assertOwnerAmendmentTagAbsentAtAcceptance({ ...context, readTagRef });
    assert.deepEqual(first, final);
    assert.deepEqual(final, { status: 'OWNER_AMENDMENT_NOT_APPLICABLE', attempted: false, tagRef: null });
    assert.equal(Object.isFrozen(final), true);
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], seen[1]);
  }
});
