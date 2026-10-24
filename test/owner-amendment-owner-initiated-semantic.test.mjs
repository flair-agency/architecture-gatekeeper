import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createOwnerAmendmentSemanticEligibilityProducer, OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_SCHEMA_BYTES,
  OWNER_INITIATED_AMENDMENT_SEMANTIC_ELIGIBILITY_SCHEMA_BYTES } from '../dist/owner-amendment-semantic-eligibility.mjs';
import { validateOwnerAmendmentOwnerInitiatedAmendmentRecord } from '../dist/owner-amendment-owner-initiated-record.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const bytes = value => Buffer.from(`${JSON.stringify(canonical(value))}\n`);
function fixture() {
  const repository = 'flair-agency/architecture-gatekeeper', baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40);
  const path = 'docs/architecture.md', triggerProfile = 'owner-initiated-self-v1';
  const beforeBytes = Buffer.from('# Contract\nExisting rule: old.\n'), afterBytes = Buffer.from('# Contract\nExisting rule: new.\n');
  const descriptors = [{ id: 'architecture', repository, resolvedCommit: baseSha, path, byteLength: beforeBytes.length, sha256: hash(beforeBytes) }];
  const authoritySet = { digest: hash(Buffer.from(JSON.stringify(descriptors))), members: [{ ...descriptors[0], bytes: beforeBytes }] };
  const resultingAuthoritySetDigest = hash(Buffer.from(JSON.stringify([{ ...descriptors[0], byteLength: afterBytes.length, sha256: hash(afterBytes) }])));
  const changes = [{ path, beforeBytes, afterBytes }], changeDigests = [{ path, beforeSha256: hash(beforeBytes), afterSha256: hash(afterBytes) }];
  const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'low',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 131072, maxTotalBytes: 524288, maxPromptBytes: 524288 },
    ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile, authorityId: 'architecture', authorityPath: path,
      evidenceProducer: 'github-actions-attestation', tagNamespace: 'refs/tags/architecture-gatekeeper/amendments', maxPromptBytes: 524288 } } } };
  const protectedInputs = { baseBranch: 'main', policyBytes: bytes(policy), manifestBytes: bytes({ version: 1, authorities: [{ id: 'architecture', repository: 'self', revision: 'authority-revision', path }] }),
    authoritySet, changes, diffBytes: Buffer.from(`diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1,2 +1,2 @@\n # Contract\n-Existing rule: old.\n+Existing rule: new.\n`) };
  const record = { version: 1, kind: 'owner-amendment-owner-initiated-amendment-record', triggerProfile, historicalTrigger: 'none', repository, baseSha, headSha: bSha, policyRevision: baseSha,
    authority: { id: 'architecture', path, previousSha256: hash(beforeBytes), newSha256: hash(afterBytes) }, changes: changeDigests,
    priorAuthoritySetDigest: authoritySet.digest, resultingAuthoritySetDigest, purpose: 'Revise the existing rule from old to new.' };
  const amendmentRecordBytes = bytes(record), tagRef = `refs/tags/architecture-gatekeeper/amendments/${bSha}`;
  const envelope = { version: 4, profile: 'self-g0', triggerProfile, historicalTrigger: 'none', bSha,
    amendmentRecordBase64: amendmentRecordBytes.toString('base64'), amendmentRecordSha256: hash(amendmentRecordBytes) };
  const tagObjectBytes = Buffer.from(`object ${bSha}\ntype commit\ntag ${tagRef.slice(10)}\ntagger Test <test@example.invalid> 1780000000 +0000\n\n${bytes(envelope)}`);
  const tagObjectOid = createHash('sha1').update(Buffer.from(`tag ${tagObjectBytes.length}\0`)).update(tagObjectBytes).digest('hex');
  const tag = { tagRef, tagObjectOid, observedTagRefOid: tagObjectOid };
  const producer = { workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: baseSha, workflowRef: 'refs/heads/main', runId: '2002', runAttempt: '1', jobId: 'eligibility' };
  const gatekeeper = { repository, revision: 'e'.repeat(40), package: null };
  const dependencies = { resolveProtectedInputs: () => protectedInputs, resolveExactGitDiff: () => ({ diffBytes: protectedInputs.diffBytes }),
    resolveExactBFiles: () => ({ files: [{ path, bytes: afterBytes }] }), resolveProtectedSelection: () => ({ selectedProducer: producer, selectedGatekeeper: gatekeeper }),
    validateAmendmentRecord: validateOwnerAmendmentOwnerInitiatedAmendmentRecord,
    validateTag: ({ expected }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', ...expected }) };
  const args = { repository, baseSha, bSha, triggerProfile, historicalTrigger: 'none', policyRevision: baseSha, amendmentRecordBytes,
    tag, tagObjectBytes, producer, gatekeeper, reviewModel: 'gpt-6.1-sol', reviewReasoningEffort: 'low' };
  const api = createOwnerAmendmentSemanticEligibilityProducer(dependencies);
  return { api, args, dependencies, protectedInputs, record };
}
function decision(prepared, eligible = true) {
  const checks = Object.fromEntries(['materiallyAddressesTrigger', 'amendsOnlyTargetDecision', 'excludesUnrelatedChanges',
    'excludesImplementationWorkflowAndExecutablePolicyEdits', 'excludesUnsupportedCompletionClaims', 'resultingAuthorityIsCoherent',
    'assessesResultingRulesWithoutRequiringAgreementWithSupersededRules'].map(key => [key, true]));
  checks.materiallyAddressesTrigger = eligible;
  return bytes({ version: 1, kind: 'owner-amendment-semantic-eligibility-decision', eligibility: eligible ? 'ELIGIBLE' : 'INELIGIBLE',
    triggerProfile: prepared.triggerProfile, authorityIds: prepared.authorityIds, authoritySetDigest: prepared.authoritySetDigest, checks });
}
function complete(f, prepared, eligible = true) { return f.api.complete({ prepared, decisionBytes: decision(prepared, eligible), producer: f.args.producer,
  gatekeeper: f.args.gatekeeper, reviewModel: f.args.reviewModel, reviewReasoningEffort: f.args.reviewReasoningEffort }); }

test('owner initiated semantic review binds real record, declaration, new schema and closed receipt v2 without historical review', () => {
  const f = fixture(), p = f.api.prepare(f.args);
  assert.equal(p.historicalTrigger, 'none'); assert.equal(Object.hasOwn(p, 'triggerReviewRecordSha256'), false);
  assert.deepEqual(p.schemaBytes, OWNER_INITIATED_AMENDMENT_SEMANTIC_ELIGIBILITY_SCHEMA_BYTES);
  assert.equal(p.schemaSha256, hash(p.schemaBytes));
  assert.deepEqual(JSON.parse(OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_SCHEMA_BYTES).properties.triggerProfile.enum,
    ['completed-block-v1', 'completed-owner-decision-self-v1']);
  assert.equal(JSON.parse(p.schemaBytes).properties.triggerProfile.const, f.args.triggerProfile);
  assert.match(p.promptBytes.toString(), /No historical trigger review is used/);
  assert.match(p.promptBytes.toString(), /Revise the existing rule from old to new/);
  assert.doesNotMatch(p.promptBytes.toString(), /<untrusted-trigger-review-record-utf8>/);
  for (const eligible of [true, false]) {
    const result = complete(f, p, eligible);
    assert.equal(result.receipt.version, 2); assert.equal(result.receipt.historicalTrigger, 'none');
    assert.equal(Object.hasOwn(result.receipt, 'triggerReviewRecordSha256'), false);
    assert.equal(result.receipt.amendmentRecordSha256, hash(f.args.amendmentRecordBytes));
    assert.equal(f.api.validateReceipt({ receiptBytes: result.receiptBytes, expected: result.receipt }).eligibility, eligible ? 'ELIGIBLE' : 'INELIGIBLE');
    for (const update of [{ version: 1 }, { historicalTrigger: null }, { triggerProfile: 'completed-block-v1' }, { triggerReviewRecordSha256: 'f'.repeat(64) }]) {
      assert.throws(() => f.api.validateReceipt({ receiptBytes: bytes({ ...result.receipt, ...update }), expected: result.receipt }));
    }
  }
});
test('owner initiated rejects absent marker, historical inputs, unselected policy and mismatched protected selections', () => {
  const f = fixture();
  for (const update of [{ historicalTrigger: undefined }, { historicalTrigger: null }, { triggerReviewRecordBytes: undefined },
    { triggerReviewRecordBytes: Buffer.alloc(0) }, { triggerProducer: {} }, { validateTriggerProvenance: () => {} },
    { triggerReviewRecordSha256: 'f'.repeat(64) }, { attestationBundleBytes: Buffer.from('{}') },
    { producer: { ...f.args.producer, runId: '9009' } }, { reviewModel: 'other' }, { reviewReasoningEffort: 'high' },
    { gatekeeper: { ...f.args.gatekeeper, revision: 'f'.repeat(40) } }, { bSha: 'f'.repeat(40) }]) {
    assert.throws(() => f.api.prepare({ ...f.args, ...update }));
  }
  const policy = JSON.parse(f.protectedInputs.policyBytes); delete policy.branches.main.ownerAmendment;
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.dependencies,
    resolveProtectedInputs: () => ({ ...f.protectedInputs, policyBytes: bytes(policy) }) }).prepare(f.args));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.dependencies, resolveProtectedSelection: null }));
});
test('owner initiated requires complete decision and exact unchanged schema, model, Set and tag bindings', () => {
  const f = fixture(), p = f.api.prepare(f.args), valid = JSON.parse(decision(p));
  for (const update of [{ checks: {} }, { version: 2 }, { triggerProfile: 'completed-owner-decision-self-v1' },
    { authorityIds: [] }, { authoritySetDigest: 'f'.repeat(64) }, { historicalTrigger: 'none' }]) {
    assert.throws(() => f.api.complete({ prepared: p, decisionBytes: bytes({ ...valid, ...update }), producer: f.args.producer,
      gatekeeper: f.args.gatekeeper, reviewModel: f.args.reviewModel, reviewReasoningEffort: f.args.reviewReasoningEffort }));
  }
  p.schemaBytes[0] ^= 1; assert.throws(() => complete(f, p), /changed after prompt/);
  for (const field of ['authoritySetDigest', 'resultingAuthoritySetDigest', 'bSha', 'historicalTrigger', 'authorityId', 'authorityPath']) {
    assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.dependencies,
      validateAmendmentRecord: input => ({ ...f.dependencies.validateAmendmentRecord(input), [field]: 'bad' }) }).prepare(f.args));
  }
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.dependencies,
    validateTag: ({ expected }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', ...expected, historicalTrigger: 'unknown' }) }).prepare(f.args));
});

test('completed-review profiles reject the owner-initiated absence marker and still require historical verifier', () => {
  const f = fixture();
  for (const triggerProfile of ['completed-block-v1', 'completed-owner-decision-self-v1']) {
    assert.throws(() => f.api.prepare({ ...f.args, triggerProfile, historicalTrigger: undefined }), /absence marker/);
    const { historicalTrigger, ...args } = f.args;
    assert.throws(() => f.api.prepare({ ...args, triggerProfile }), /trusted validateTriggerProvenance/);
  }
});
