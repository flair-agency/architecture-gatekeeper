import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveOwnerAmendmentGitChanges, computeOwnerAmendmentResultingAuthoritySet } from '../dist/owner-amendment-git-changes.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from '../dist/owner-amendment-handoff-git-context.mjs';
import { materializeAuthoritySet } from '../dist/authority-set.mjs';
import { produceOwnerAmendmentOwnerDecision } from '../scripts/owner-amendment-owner-decision-producer.mjs';
import { buildOwnerAmendmentOwnerDecisionAmendmentRecord, validateOwnerAmendmentOwnerDecisionAmendmentRecord } from '../dist/owner-amendment-owner-decision-amendment-record.mjs';
import { createOwnerAmendmentSemanticEligibilityProducer } from '../dist/owner-amendment-semantic-eligibility.mjs';
import { verifyOwnerAmendmentOwnerDecisionContext } from '../dist/owner-amendment-owner-decision-context-verifier.mjs';
import { parseOwnerAmendmentSemanticTagObject } from '../dist/owner-amendment-semantic-tag-object.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } });
}
function put(root, path, bytes) {
  const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
}
function commit(root) {
  git(root, ['add', '-A']); git(root, ['commit', '--allow-empty', '-m', 'fixture']);
  return git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
}

test('binds every OWNER_DECISION authority blob and the complete unfiltered Git diff', () => {
  const root = mkdtempSync(join(tmpdir(), 'agk-multipath-git-changes-'));
  try {
    git(root, ['init', '-q']);
    const beforeA = Buffer.from('prior selected authority\n'), beforeB = Buffer.from('prior second authority\n');
    const afterA = Buffer.from('amended selected authority\n'), afterB = Buffer.from('amended second authority\n');
    put(root, 'docs/architecture.md', beforeA); put(root, 'docs/ownership.md', beforeB);
    const baseSha = commit(root);
    put(root, 'docs/architecture.md', afterA); put(root, 'docs/ownership.md', afterB);
    const bSha = commit(root);
    const readBlob = (revision, path) => git(root, ['--no-replace-objects', 'show', `${revision}:${path}`]);
    const authorityChanges = [
      { path: 'docs/architecture.md', beforeBytes: beforeA, afterBytes: afterA },
      { path: 'docs/ownership.md', beforeBytes: beforeB, afterBytes: afterB },
    ];
    const changedFiles = authorityChanges.map(({ path }) => ({ path, status: 'modified' }));
    const members = [
      { id: 'architecture-contract', repository, resolvedCommit: baseSha, path: 'docs/architecture.md',
        byteLength: beforeA.length, sha256: sha256(beforeA), content: beforeA },
      { id: 'ownership-charter', repository, resolvedCommit: baseSha, path: 'docs/ownership.md',
        byteLength: beforeB.length, sha256: sha256(beforeB), content: beforeB },
    ];
    const runGit = args => git(root, args);
    const result = deriveOwnerAmendmentGitChanges({ profile: 'completed-owner-decision-self-v1', repository,
      baseSha, bSha, targetPath: 'docs/architecture.md',
      selectedAuthorityBytes: { base: beforeA, head: afterA }, changedFiles, authorityChanges, runGit, readBlob });
    assert.deepEqual(result.changes.map(change => change.path), ['docs/architecture.md', 'docs/ownership.md']);
    assert.deepEqual(result.changes[1].beforeBytes, readBlob(baseSha, 'docs/ownership.md'));
    assert.deepEqual(result.changes[1].afterBytes, readBlob(bSha, 'docs/ownership.md'));
    assert.match(result.diffBytes.toString('utf8'), /diff --git a\/docs\/ownership\.md b\/docs\/ownership\.md/);
    assert.match(result.diffBytes.toString('utf8'), /diff --git a\/docs\/architecture\.md b\/docs\/architecture\.md/);

    const canonicalDigest = descriptors => sha256(Buffer.from(JSON.stringify(descriptors), 'utf8'));
    const prior = canonicalDigest(members.map(({ content, ...member }) => member));
    const expectedDescriptors = members.map((member, index) => ({ id: member.id, repository: member.repository,
      resolvedCommit: member.resolvedCommit, path: member.path,
      byteLength: index === 0 ? afterA.length : afterB.length, sha256: sha256(index === 0 ? afterA : afterB) }));
    const resulting = canonicalDigest(expectedDescriptors);
    const rebound = computeOwnerAmendmentResultingAuthoritySet({ members, changes: result.changes, repository, baseSha,
      expectedPriorDigest: prior, expectedResultingDigest: resulting });
    assert.equal(rebound.priorDigest, prior);
    assert.equal(rebound.resultingDigest, resulting);
    assert.equal(rebound.descriptors[1].sha256, sha256(afterB));

    assert.throws(() => deriveOwnerAmendmentGitChanges({ profile: 'completed-owner-decision-self-v1', repository,
      baseSha, bSha, targetPath: 'docs/architecture.md', selectedAuthorityBytes: { base: beforeA, head: afterA },
      changedFiles, authorityChanges: authorityChanges.slice(0, 1), runGit, readBlob }), /complete modified Git path set/);
    assert.throws(() => deriveOwnerAmendmentGitChanges({ profile: 'completed-owner-decision-self-v1', repository,
      baseSha, bSha, targetPath: 'docs/architecture.md', selectedAuthorityBytes: { base: beforeA, head: afterA },
      changedFiles, authorityChanges: authorityChanges.map((change, index) => index ? { ...change, afterBytes: beforeA } : change),
      runGit, readBlob }), /Git bytes differ/);
    assert.throws(() => computeOwnerAmendmentResultingAuthoritySet({ members, changes: result.changes, repository,
      baseSha, expectedPriorDigest: prior, expectedResultingDigest: '0'.repeat(64) }), /resulting Authority Set digest/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('real OWNER_DECISION handoff context feeds both-path semantic preparation and merge reconstruction', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agk-multipath-pipeline-'));
  const profile = 'completed-owner-decision-self-v1';
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const manifestPath = '.codex/gatekeeper/authorities.json';
  const targetPath = 'docs/architecture.md';
  const secondPath = 'docs/security.md';
  const limits = { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 65_536,
    maxTotalBytes: 262_144, maxPromptBytes: 262_144 };
  const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityManifestPath: manifestPath,
    authorityLimits: limits, ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile: profile,
      authorityId: 'architecture-contract', authorityPath: targetPath, evidenceProducer: 'github-actions-attestation',
      tagNamespace: 'refs/tags/architecture-gatekeeper/amendments', maxPromptBytes: 262_144 },
  } } };
  const policyBytes = Buffer.from(`${JSON.stringify(policy)}\n`);
  const manifestBytes = Buffer.from(JSON.stringify({ version: 1, authorities: [
    { id: 'architecture-contract', repository: 'self', revision: 'authority-revision', path: targetPath },
    { id: 'security-contract', repository: 'self', revision: 'authority-revision', path: secondPath },
  ] }));
  const beforeTarget = Buffer.from('Previous architecture contract.\n');
  const afterTarget = Buffer.from('Amended architecture contract.\n');
  const beforeSecond = Buffer.from('Previous security contract.\n');
  const afterSecond = Buffer.from('Amended security contract.\n');
  try {
    git(root, ['init', '-q']);
    put(root, policyPath, policyBytes); put(root, manifestPath, manifestBytes);
    put(root, targetPath, beforeTarget); put(root, secondPath, beforeSecond);
    const baseSha = commit(root);
    put(root, targetPath, afterTarget); put(root, secondPath, afterSecond);
    const bSha = commit(root);
    const runGit = args => git(root, args);
    const context = resolveOwnerAmendmentHandoffGitContext({ repository, baseSha, headSha: bSha, baseBranch: 'main', runGit });
    const exact = deriveOwnerAmendmentGitChanges({ profile, repository, baseSha, bSha, targetPath,
      selectedAuthorityBytes: context.authorityBytes, changedFiles: context.changedFiles,
      authorityChanges: context.authorityChanges, runGit,
      readBlob: (revision, path) => runGit(['--no-replace-objects', 'show', `${revision}:${path}`]) });
    assert.deepEqual(exact.changes.map(change => change.path), [targetPath, secondPath]);
    const set = await materializeAuthoritySet({ manifestBytes: context.manifestBytes, limits: context.limits,
      selfRepository: repository, selfRoot: root, authorityRevision: baseSha });
    const baseDescriptors = set.members.map(({ content, ...member }) => member);
    assert.equal(context.priorAuthoritySetDigest, sha256(Buffer.from(JSON.stringify(baseDescriptors), 'utf8')));
    const members = set.members.map(member => ({ ...member, bytes: Buffer.from(member.content, 'utf8') }));
    const workflowPath = '.github/workflows/self-architecture-gate.yml';
    const decision = { decision: 'OWNER_DECISION', findings: [], summary: 'The selected existing rule needs an owner decision.',
      authority: members.map(member => member.id), authorityFiles: members.map(member => member.path),
      authorityIds: members.map(member => member.id), responsibility: ['consumer owner decision'],
      capabilitySurface: ['existing assurance review'], qualityGuarantees: ['preserve previous policy'],
      reviewedScope: ['two declared self authority files'], prohibitedChanges: ['route activation'],
      gates: { sharedMechanism: { decision: 'OWNER_DECISION', summary: 'Existing rule requires an owner choice.',
        consumerOwnership: 'consumer remains owner', failClosedBehavior: 'missing evidence fails closed',
        compatibility: 'previous policy remains selected', minimality: 'only authority files' },
      trustBoundary: { decision: 'PASS', summary: 'No trust-boundary change.', tokenPermissions: 'read only',
        untrustedInputs: 'candidate claims are review data', credentialHandling: 'separate protected producer',
        reportingIsolation: 'eligibility does not accept' } } };
    const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
    const descriptorMembers = members.map(({ bytes, content, ...descriptor }) => descriptor);
    const triggerRecord = produceOwnerAmendmentOwnerDecision({ decisionBytes,
      provenance: { version: 1, selfRepository: repository, authorityRevision: baseSha,
        manifestSha256: sha256(context.manifestBytes), setDigest: set.setDigest, members: descriptorMembers },
      context: { repository, prNumber: 51, baseSha, headSha: 'c'.repeat(40), mergeSha: 'd'.repeat(40),
        workflowSha: baseSha, workflowPath, runId: '101', runAttempt: '1' },
      baseInputs: { policy: context.policyBytes, manifest: context.manifestBytes, prompt: Buffer.from('trigger prompt'),
        schema: readFileSync(new URL('../.codex/gatekeeper/ci-decision.schema.json', import.meta.url)),
        validation: readFileSync(new URL('../.codex/gatekeeper/decision.validation.json', import.meta.url)) },
      readAuthority: (_revision, path) => runGit(['--no-replace-objects', 'show', `${baseSha}:${path}`]) });
    const reviewRecordBytes = Buffer.from(`${JSON.stringify(triggerRecord)}\n`);
    const bundleBytes = Buffer.from('{"attestation":"fixture bundle"}\n');
    const amendment = buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes,
      attestationBundleBytes: bundleBytes, repository, baseSha, bSha, authorityId: context.scope.authorityId,
      authorityPath: context.scope.authorityPath, previousAuthorityBytes: context.authorityBytes.base,
      amendedAuthorityBytes: context.authorityBytes.head, authorityChanges: exact.changes,
      priorAuthoritySetDigest: context.priorAuthoritySetDigest,
      resultingAuthoritySetDigest: context.resultingAuthoritySetDigest,
      purpose: 'Resolve the selected existing owner decision.' });
    const tagRef = `${policy.branches.main.ownerAmendment.tagNamespace}/${bSha}`;
    const tagEnvelope = { version: 3, profile: 'self-g0', triggerProfile: profile, bSha,
      reviewRecordBase64: reviewRecordBytes.toString('base64'), reviewRecordSha256: sha256(reviewRecordBytes),
      attestationBundleBase64: bundleBytes.toString('base64'), attestationBundleSha256: sha256(bundleBytes),
      amendmentRecordBase64: amendment.bytes.toString('base64'), amendmentRecordSha256: sha256(amendment.bytes) };
    const tagMessage = `${JSON.stringify(tagEnvelope)}\n`;
    const tagObjectBytes = Buffer.from(`object ${bSha}\ntype commit\ntag ${tagRef.slice('refs/tags/'.length)}\n` +
      'tagger Fixture <fixture@example.invalid> 1790000000 +0000\n\n' + tagMessage);
    const transported = parseOwnerAmendmentSemanticTagObject(tagObjectBytes, { bSha, triggerProfile: profile, tagRef });
    const tagOid = createHash('sha1').update(Buffer.from(`tag ${tagObjectBytes.length}\0`)).update(tagObjectBytes).digest('hex');
    const producerIdentity = { workflowPath, workflowSha: baseSha, workflowRef: 'refs/heads/main',
      runId: '202', runAttempt: '1', jobId: 'owner-amendment-semantic-eligibility-signer' };
    const gatekeeper = { repository, revision: 'e'.repeat(40), package: null };
    const diffBytes = runGit(['--no-replace-objects', 'diff', '--binary', '--no-ext-diff', '--no-renames', baseSha, bSha]);
    const producer = createOwnerAmendmentSemanticEligibilityProducer({
      resolveProtectedInputs: () => ({ baseBranch: 'main', policyBytes: context.policyBytes, manifestBytes: context.manifestBytes,
        authoritySet: { digest: set.setDigest, members: set.members.map(member => ({ id: member.id,
          repository: member.repository, resolvedCommit: member.resolvedCommit, path: member.path,
          byteLength: member.byteLength, sha256: member.sha256, bytes: Buffer.from(member.content, 'utf8') })) },
        changes: exact.changes, diffBytes }),
      resolveExactGitDiff: () => ({ diffBytes }),
      resolveExactBFiles: ({ paths }) => ({ files: paths.map(path => ({ path, bytes: runGit(['--no-replace-objects', 'show', `${bSha}:${path}`]) })) }),
      resolveProtectedSelection: () => ({ selectedProducer: producerIdentity, selectedGatekeeper: gatekeeper }),
      validateTriggerProvenance: ({ bytes, expected }) => ({ status: bytes.equals(reviewRecordBytes) ? 'VERIFIED_OWNER_AMENDMENT_TRIGGER' : 'INCOMPLETE',
        repository, baseSha, triggerProfile: profile, triggerReviewRecordSha256: sha256(bytes), workflowPath: expected.workflowPath,
        workflowSha: expected.workflowSha, workflowRef: expected.workflowRef, runId: expected.runId, runAttempt: expected.runAttempt }),
      validateAmendmentRecord: ({ bytes, expected }) => validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes, expected }),
      validateTag: ({ tag, expected }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha, bSha,
        triggerProfile: profile, triggerReviewRecordSha256: expected.triggerReviewRecordSha256,
        amendmentRecordSha256: expected.amendmentRecordSha256, tagRef: expected.tagRef,
        tagObjectOid: expected.tagObjectOid, observedTagRefOid: expected.observedTagRefOid }),
    });
    const prepared = producer.prepare({ repository, baseSha, bSha, triggerProfile: profile, policyRevision: baseSha,
      policyBytes: context.policyBytes, authoritySet: { digest: set.setDigest, members: set.members.map(member => ({ ...member,
        bytes: Buffer.from(member.content, 'utf8') })) }, manifestBytes: context.manifestBytes, changes: exact.changes, diffBytes,
      triggerReviewRecordBytes: transported.reviewRecordBytes, triggerProducer: { workflowPath, workflowSha: baseSha,
        workflowRef: 'refs/heads/main', runId: '101', runAttempt: '1', jobId: 'owner-amendment-owner-decision-record' },
      amendmentRecordBytes: transported.amendmentRecordBytes, tag: { tagRef, tagObjectOid: tagOid, observedTagRefOid: tagOid },
      tagObjectBytes, producer: producerIdentity, selectedProducer: producerIdentity, gatekeeper, selectedGatekeeper: gatekeeper,
      reviewModel: policy.branches.main.model, reviewReasoningEffort: policy.branches.main.reasoningEffort });
    assert.deepEqual(prepared.changes.map(change => change.path), [targetPath, secondPath]);
    assert.equal(prepared.diffSha256, sha256(diffBytes));

    const trustedChanges = exact.changes.map(change => ({ path: change.path,
      beforeSha256: sha256(change.beforeBytes), afterSha256: sha256(change.afterBytes) }));
    const trustedContext = { repository, baseSha, bSha, policyRevision: baseSha,
      policy: { grade: 'G0', scope: 'authority-only', triggerProfile: profile,
        authorities: [{ id: context.scope.authorityId, path: context.scope.authorityPath }] },
      authority: { id: context.scope.authorityId, path: context.scope.authorityPath,
        previousSha256: sha256(context.authorityBytes.base), newSha256: sha256(context.authorityBytes.head) },
      changes: trustedChanges, priorAuthoritySetDigest: context.priorAuthoritySetDigest,
      resultingAuthoritySetDigest: context.resultingAuthoritySetDigest };
    const envelope = { headSha: bSha, tag: { objectOid: tagOid }, tagRef,
      observedTagRefOid: tagOid, reviewRecordBytes: transported.reviewRecordBytes,
      attestationBundleBytes: transported.attestationBundleBytes, amendmentRecordBytes: transported.amendmentRecordBytes,
      triggerProfile: profile };
    const reconstructed = verifyOwnerAmendmentOwnerDecisionContext({ trustedContext, tagEnvelope: envelope });
    assert.equal(reconstructed.status, 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT', reconstructed.reason);
    assert.deepEqual(reconstructed.changes, trustedChanges);
    assert.equal(reconstructed.resultingAuthoritySetDigest, context.resultingAuthoritySetDigest);
    const incomplete = verifyOwnerAmendmentOwnerDecisionContext({ trustedContext: { ...trustedContext,
      changes: trustedChanges.slice(0, 1) }, tagEnvelope: envelope });
    assert.equal(incomplete.status, 'INCOMPLETE');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
