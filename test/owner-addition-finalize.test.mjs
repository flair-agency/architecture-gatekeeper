import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildOwnerAdditionFinalRecord, summarizeG0TagRefReadback, verifyG0TagObjectEvidence,
  verifyMergeAncestorComparison, parsePinnedGatekeeperWorkflow, parseGatekeeperWorkflowDefaults,
  readG0TagObjectReadback, validateOwnerAdditionProducerJobName } from '../src/owner-addition-finalize.mjs';
import { digestOwnerDecisionAddition } from '../src/owner-decision-addition.mjs';

const sha = char => char.repeat(40);
const digest = char => char.repeat(64);

function input() {
  const repository = 'flair-agency/example';
  const targetBranch = 'main';
  const pullRequestNumber = 42;
  const baseSha = sha('a');
  const bSha = sha('b');
  const bTree = sha('c');
  const authorityDigest = digest('d');
  const authorityMembers = [
    { id: 'architecture', repository, resolvedCommit: baseSha, path: 'docs/architecture.md', byteLength: 9, sha256: digest('a') },
    { id: 'policy', repository, resolvedCommit: baseSha, path: 'docs/policy.md', byteLength: 7, sha256: digest('b') },
  ];
  const authoritySetDigest = createHash('sha256').update(JSON.stringify(authorityMembers)).digest('hex');
  const completedAt = '2026-09-26T01:00:00.000Z';
  const mergedAt = '2026-09-26T02:00:00.000Z';
  const procedure = { status: 'verified', digest: digest('1'), repository, baseSha, bSha, targetBranch,
    pullRequestNumber, tagTargetSha: bSha, tagObjectOid: sha('7'), ownerDecisionId: 'decision-42',
    authorityId: 'architecture', authorityPath: 'docs/architecture.md',
    tagRef: `refs/tags/architecture-owner-addition/${bSha}`, additionRecordSha256: digest('4'),
    missingDecisionId: 'decision-42', authoritySetDigest, authorityIds: ['architecture', 'policy'] };
  const ordinaryDecision = { status: 'verified', decision: 'OWNER_DECISION', ownerDecisionId: 'decision-42',
    repository, baseSha, bSha, authoritySetDigest, authorityIds: ['architecture', 'policy'] };
  const authoritySet = { status: 'verified', ids: ['architecture', 'policy'], digest: authoritySetDigest };
  const authoritySetProvenance = { version: 2, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: digest('c'), setDigest: authoritySetDigest, members: authorityMembers };
  const eligibility = { status: 'verified', digest: digest('2'), result: 'eligible', repository, baseSha, bSha,
    pullRequestNumber, authoritySetDigest, authorityIds: ['architecture', 'policy'] };
  const provenance = { status: 'verified', selection: 'recorded-base-policy',
    workflow: { runId: '100', attempt: 1, jobId: '200', workflowPath: '.github/workflows/architecture-gate.yml',
      callerPath: '.github/workflows/call-gate.yml' }, repository, targetBranch, pullRequestNumber, baseSha, bSha,
    authoritySetDigest, procedureDigest: procedure.digest, eligibilityDigest: eligibility.digest, completedAt };
  const eligibilityEvidence = { status: 'verified', provenance, completedAt };
  const eligibilityArtifactBinding = { checkRunId: '555', artifactId: '987', artifactDigest: `sha256:${digest('e')}`,
    annotationTitle: 'AGK_OWNER_ADDITION_ARTIFACT_V1', annotationMessage: `id=987;sha256=${digest('e')}` };
  const merge = { hostMetadata: { status: 'verified', repository, targetBranch, pullRequestNumber, headSha: bSha,
      baseSha, state: 'merged', mergeSha: sha('f'), mergedAt },
    commit: { sha: sha('f'), parents: [baseSha, bSha], tree: bTree } };
  const targetReadback = { status: 'verified', repository, targetRef: 'refs/heads/main', targetSha: sha('9'),
    ancestorShas: [sha('f'), bSha, baseSha], authorityDigest };
  const selected = { mode: 'procedural', adoptionEvidenceProducer: 'github-actions',
    adoptionEvidenceWorkflowPath: '.github/workflows/call-gate.yml', adoptionEvidenceJobName: 'Architecture Gate / owner-addition' };
  const identities = { gatekeeper: { path: 'flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml',
      sha: sha('5'), status: 'verified' },
    ordinaryPrompt: { path: 'docs/prompt.md', sha256: digest('6'), status: 'verified' },
    ordinarySchema: { path: 'docs/schema.json', sha256: digest('7'), status: 'verified' },
    validation: { path: null, sha256: null, status: 'not_selected' } };
  return { repository, targetBranch, pullRequestNumber, baseSha, bSha, bTree, authorityDigest,
    policy: { version: 5, adoptionEvidence: { producer: 'github-actions', workflowPath: '.github/workflows/call-gate.yml',
      jobName: 'Architecture Gate / owner-addition' } }, policySha256: digest('3'), policyPath: '.codex/gatekeeper/ci-policy.json',
    selected, identities, procedure, ordinaryDecision, authoritySet, authoritySetProvenance, eligibility,
    eligibilityEvidence, eligibilityArtifactBinding, merge, targetReadback,
    generatedAt: '2026-09-26T03:00:00.000Z' };
}

test('final record binds pre-merge producer, merge commit, target readback and independent assurance', () => {
  const record = buildOwnerAdditionFinalRecord(input());
  assert.equal(record.outcome.adoption, 'valid');
  assert.equal(record.outcome.canonical, 'verified');
  assert.equal(record.selectedPolicy.sha256, digest('3'));
  assert.equal(record.authoritySet.manifestSha256, digest('c'));
  assert.deepEqual(record.authoritySet.members, input().authoritySetProvenance.members);
  assert.equal(record.authoritySet.members[0].repository, 'flair-agency/example');
  assert.equal(record.authoritySet.members[0].resolvedCommit, record.candidate.baseSha);
  assert.equal(record.authoritySet.members[0].path, 'docs/architecture.md');
  assert.equal(record.authoritySet.members[0].sha256, digest('a'));
  assert.equal(record.addition.authorityId, 'architecture');
  assert.equal(record.addition.authorityPath, 'docs/architecture.md');
  assert.equal(record.addition.tagRef, `refs/tags/architecture-owner-addition/${record.candidate.bSha}`);
  assert.equal(record.addition.additionRecordSha256, digest('4'));
  assert.equal(record.addition.ownerDecisionId, 'decision-42');
  assert.equal(record.eligibility.completedAt, '2026-09-26T01:00:00.000Z');
  assert.deepEqual(record.eligibility.artifactBinding, input().eligibilityArtifactBinding);
  assert.deepEqual(record.eligibility.producer, { runId: '100', attempt: 1, jobId: '200',
    workflowPath: '.github/workflows/architecture-gate.yml', callerPath: '.github/workflows/call-gate.yml' });
  assert.deepEqual(record.merge.parents, [sha('a'), sha('b')]);
  assert.equal(record.canonical.observedSha, sha('9'));
  assert.equal(record.assurance.principalAuthentication, 'not_verified');
  assert.equal(record.assurance.hostEnforcement, 'not_verified');
  assert.equal(record.assurance.policyProtection, 'not_claimed');
  assert.deepEqual(record.gatekeeper, input().identities.gatekeeper);
  assert.equal(record.callerWorkflow.revision, record.candidate.baseSha);
  assert.equal(record.reviewInputs.ordinary.prompt.sha256, digest('6'));
  assert.equal(record.reviewInputs.ordinary.validation.status, 'not_selected');
});

test('record generation preserves an independently invalid adoption outcome', () => {
  const value = input();
  value.eligibility.result = 'ineligible';
  value.eligibilityEvidence.provenance.eligibilityDigest = value.eligibility.digest;
  const record = buildOwnerAdditionFinalRecord(value);
  assert.equal(record.outcome.canonical, 'verified');
  assert.equal(record.outcome.adoption, 'invalid');
});

test('final record rejects missing verified producer artifact identity', () => {
  const value = input();
  delete value.eligibilityArtifactBinding;
  assert.throws(() => buildOwnerAdditionFinalRecord(value), /artifact identity is missing/);
});

test('immutable G0 tag object remains valid when its mutable ref has moved or disappeared', () => {
  const additionRecord = { decision: 'decision-42' };
  const procedure = { tagObjectOid: sha('7'), headSha: sha('b'), additionRecordSha256: digestOwnerDecisionAddition(additionRecord) };
  assert.deepEqual(verifyG0TagObjectEvidence(procedure, { sha: sha('7'), object: { type: 'commit', sha: sha('b') },
    message: JSON.stringify(additionRecord) }), additionRecord);
  assert.equal(summarizeG0TagRefReadback({ ref: 'refs/tags/example', object: { sha: sha('8'), type: 'tag' } },
    'refs/tags/example', sha('7')).status, 'moved');
  assert.equal(summarizeG0TagRefReadback(null, 'refs/tags/example', sha('7')).status, 'unavailable');
  assert.throws(() => verifyG0TagObjectEvidence(procedure, { sha: sha('7'), object: { type: 'commit', sha: sha('b') },
    message: '{"decision":"decision-42","decision":"other"}' }), /strict AdditionRecord/);
});

test('deleted immutable tag object readback does not invalidate pre-merge producer evidence', async () => {
  const additionRecord = { decision: 'decision-42' };
  const procedure = { tagObjectOid: sha('7'), headSha: sha('b'), additionRecordSha256: digestOwnerDecisionAddition(additionRecord) };
  const readback = await readG0TagObjectReadback({ ok: false, status: 404 }, procedure);
  assert.deepEqual(readback, { status: 'unavailable', additionRecord: null });
  const value = input();
  value.identities.g0TagReadback = { status: 'unavailable', immutableTagObject: readback.status,
    additionRecordSha256: value.procedure.additionRecordSha256 };
  const record = buildOwnerAdditionFinalRecord(value);
  assert.equal(record.outcome.adoption, 'valid');
  assert.equal(record.addition.refReadback.status, 'unavailable');
  assert.equal(record.addition.refReadback.immutableTagObject, 'unavailable');
});

test('GitHub compare identical response proves ancestry without an optional head_commit field', () => {
  assert.deepEqual(verifyMergeAncestorComparison({ status: 'identical', base_commit: { sha: sha('e') },
    merge_base_commit: { sha: sha('e') }, commits: [] }, sha('e'), sha('e')), [sha('e')]);
  assert.throws(() => verifyMergeAncestorComparison({ status: 'diverged', base_commit: { sha: sha('e') },
    merge_base_commit: { sha: sha('9') }, commits: [] }, sha('e'), sha('f')), /does not prove/);
});

test('caller workflow pins exactly one immutable Gatekeeper workflow and records literal effective inputs', () => {
  const source = `name: Consumer Gate\njobs:\n  architecture:\n    uses: flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml@${sha('5')}\n    with:\n      policy-path: .codex/gatekeeper/policy.json\n      schema-path: .codex/gatekeeper/schema.json\n      validation-path: ''\n`;
  const parsed = parsePinnedGatekeeperWorkflow(Buffer.from(source));
  assert.equal(parsed.sha, sha('5'));
  assert.equal(parsed.callerJobId, 'architecture');
  assert.deepEqual(parsed.inputs, { 'policy-path': '.codex/gatekeeper/policy.json',
    'schema-path': '.codex/gatekeeper/schema.json', 'validation-path': '' });
  assert.throws(() => parsePinnedGatekeeperWorkflow(Buffer.from(source.replace(`@${sha('5')}`, '@v0.5.1'))), /pinned to a 40-character/);
  assert.throws(() => parsePinnedGatekeeperWorkflow(Buffer.from(`${source}\n  other:\n    uses: flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml@${sha('5')}\n`)), /exactly one/);
  assert.equal(validateOwnerAdditionProducerJobName('architecture / owner-addition', parsed.callerJobId), 'architecture / owner-addition');
  assert.throws(() => validateOwnerAdditionProducerJobName('unrelated / owner-addition', parsed.callerJobId), /caller Gatekeeper job ID/);
});

test('pinned reusable workflow defaults are read from the selected immutable workflow', () => {
  const source = `name: Architecture Gate\non:\n  workflow_call:\n    inputs:\n      policy-path:\n        type: string\n        default: .codex/policy.json\n      prompt-path:\n        type: string\n        default: .codex/prompt.md\n      schema-path:\n        type: string\n        default: .codex/schema.json\n      validation-path:\n        type: string\n        default: ''\n`;
  assert.deepEqual(parseGatekeeperWorkflowDefaults(Buffer.from(source)), {
    'policy-path': '.codex/policy.json', 'prompt-path': '.codex/prompt.md',
    'schema-path': '.codex/schema.json', 'validation-path': '',
  });
});
