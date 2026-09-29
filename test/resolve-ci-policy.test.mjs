import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

const limits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 };
const amendment = {
  version: 1,
  grade: 'G0',
  scope: 'authority-only',
  triggerProfile: 'completed-block-v1',
  authorityId: 'architecture',
  authorityPath: 'docs/architecture.md',
  evidenceProducer: 'github-actions-attestation',
  tagNamespace: 'refs/tags/architecture-gatekeeper/amendments',
};

function policy(ownerAmendment) {
  const branch = {
    mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
  };
  if (ownerAmendment !== undefined) branch.ownerAmendment = ownerAmendment;
  return { version: 2, default: { mode: 'local-only' }, branches: { main: branch } };
}

test('v2 enforced self policy exposes optional previous-policy OWNER_AMENDMENT G0 selection for the adapter', () => {
  const selected = resolveCiPolicy(policy(amendment), 'main');
  assert.equal(selected.ownerAmendmentVersion, 1);
  assert.equal(selected.ownerAmendmentGrade, 'G0');
  assert.equal(selected.ownerAmendmentScope, 'authority-only');
  assert.equal(selected.ownerAmendmentTriggerProfile, 'completed-block-v1');
  assert.equal(selected.ownerAmendmentAuthorityId, 'architecture');
  assert.equal(selected.ownerAmendmentAuthorityPath, 'docs/architecture.md');
  assert.equal(selected.ownerAmendmentEvidenceProducer, 'github-actions-attestation');
  assert.equal(selected.ownerAmendmentTagNamespace, 'refs/tags/architecture-gatekeeper/amendments');
  assert.equal(Object.hasOwn(selected, 'ownerAmendmentMaxPromptBytes'), false);
  assert.equal(Object.hasOwn(resolveCiPolicy(policy(), 'main'), 'ownerAmendmentGrade'), false);
  assert.equal(Object.hasOwn(resolveCiPolicy(policy(amendment), 'preview'), 'ownerAmendmentGrade'), false);
});

test('resolves only the two canonical self trigger profiles and optional OWNER_AMENDMENT prompt limit', () => {
  for (const triggerProfile of ['completed-block-v1', 'completed-owner-decision-self-v1']) {
    const selected = resolveCiPolicy(policy({ ...amendment, triggerProfile, maxPromptBytes: 262_144 }), 'main');
    assert.equal(selected.ownerAmendmentTriggerProfile, triggerProfile);
    assert.equal(selected.ownerAmendmentMaxPromptBytes, 262_144);
    assert.equal(JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64')).maxPromptBytes, limits.maxPromptBytes);
  }
  for (const maxPromptBytes of [0, -1, 1.5, '262144', 1_048_577, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => resolveCiPolicy(policy({ ...amendment, maxPromptBytes }), 'main'));
  }
  for (const triggerProfile of ['completed-block-self-v1', 'completed-owner-decision-v1', 'completed-block-v2']) {
    assert.throws(() => resolveCiPolicy(policy({ ...amendment, triggerProfile }), 'main'));
  }
});

test('owner amendment selection rejects malformed scope, authority, producer, namespace and unknown fields', () => {
  for (const invalid of [
    { ...amendment, grade: 'G1' },
    { ...amendment, scope: 'any' },
    { ...amendment, triggerProfile: 'completed-owner-decision-v1' },
    { ...amendment, authorityId: '../architecture' },
    { ...amendment, authorityPath: '../docs/architecture.md' },
    { ...amendment, authorityPath: 'docs/architecture.json' },
    { ...amendment, evidenceProducer: 'github-actions' },
    { ...amendment, tagNamespace: 'refs/tags/other' },
    { ...amendment, extra: true },
    { ...amendment, version: 2 },
  ]) assert.throws(() => resolveCiPolicy(policy(invalid), 'main'));
});

test('owner amendment selection is limited to v2 enforced branches with a selected Authority Set', () => {
  const unsupportedBranch = { mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium', ownerAmendment: amendment };
  assert.throws(() => resolveCiPolicy({ version: 4, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 5, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 5, default: { mode: 'local-only' }, branches: { main: { mode: 'local-only', ownerAmendment: amendment } } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 1, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 2, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 2, default: { mode: 'local-only' }, branches: { main: {
    ...policy().branches.main, mode: 'procedural', ownerAmendment: amendment,
  } } }, 'main'));
});
