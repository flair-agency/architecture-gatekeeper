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
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
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

test('keeps the BLOCK prompt limit optional and requires it for OWNER_DECISION', () => {
  const selected = resolveCiPolicy(policy({ ...amendment, triggerProfile: 'completed-block-v1', maxPromptBytes: 262_144 }), 'main');
  assert.equal(selected.ownerAmendmentTriggerProfile, 'completed-block-v1');
  assert.equal(selected.ownerAmendmentMaxPromptBytes, 262_144);
  assert.equal(JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64')).maxPromptBytes, limits.maxPromptBytes);
  const ownerDecision = resolveCiPolicy(policy({ ...amendment,
    triggerProfile: 'completed-owner-decision-self-v1', maxPromptBytes: 262_144 }), 'main');
  assert.equal(ownerDecision.ownerAmendmentTriggerProfile, 'completed-owner-decision-self-v1');
  assert.equal(ownerDecision.ownerAmendmentGrade, 'G0');
  assert.equal(ownerDecision.ownerAmendmentMaxPromptBytes, 262_144);
  assert.throws(() => resolveCiPolicy(policy({ ...amendment,
    triggerProfile: 'completed-owner-decision-self-v1' }), 'main'), /Invalid CI policy branch main owner amendment selection/);
  const blockWithoutLimit = resolveCiPolicy(policy(amendment), 'main');
  assert.equal(blockWithoutLimit.ownerAmendmentTriggerProfile, 'completed-block-v1');
  assert.equal(Object.hasOwn(blockWithoutLimit, 'ownerAmendmentMaxPromptBytes'), false);
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
  const unsupportedBranch = { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', ownerAmendment: amendment };
  assert.throws(() => resolveCiPolicy({ version: 4, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 5, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 5, default: { mode: 'local-only' }, branches: { main: { mode: 'local-only', ownerAmendment: amendment } } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 1, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 2, default: { mode: 'local-only' }, branches: { main: unsupportedBranch } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 2, default: { mode: 'local-only' }, branches: { main: {
    ...policy().branches.main, mode: 'procedural', ownerAmendment: amendment,
  } } }, 'main'));
});

test('v6 selects the owner-adopted Gemini profile and carries the base-selected provider settings', () => {
  const branch = {
    mode: 'enforced', provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
  };
  const resolved = resolveCiPolicy({ version: 6, default: { mode: 'local-only' }, branches: { main: branch } }, 'main');
  assert.deepEqual(resolved, {
    baseBranch: 'main', mode: 'enforced', policyVersion: 6,
    provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
    authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimitsBase64: Buffer.from(JSON.stringify(limits)).toString('base64'),
  });
  assert.equal(Object.hasOwn(resolved, 'authorityProfile'), false);
  assert.deepEqual(resolveCiPolicy({ version: 6, default: { mode: 'local-only' }, branches: { main: branch } }, 'preview'), {
    baseBranch: 'preview', mode: 'local-only', policyVersion: 6,
  });
});

test('v6 supports explicit Codex provider settings without adding a default or Gemini field', () => {
  const branch = {
    mode: 'enforced', provider: 'codex', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
  };
  const selected = resolveCiPolicy({ version: 6, default: { mode: 'local-only' }, branches: { main: branch } }, 'main');
  assert.equal(selected.provider, 'codex');
  assert.equal(selected.reasoningEffort, 'medium');
  assert.equal(Object.hasOwn(selected, 'thinkingLevel'), false);
  assert.equal(Object.hasOwn(selected, 'ownerAdditionVersion'), false);
  assert.equal(Object.hasOwn(selected, 'ownerAmendmentVersion'), false);
  assert.equal(Object.hasOwn(selected, 'adoptionEvidenceProducer'), false);
});

test('v6 rejects mixed, incomplete, unknown, and governance route settings', () => {
  const gemini = {
    mode: 'enforced', provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
  };
  const codex = {
    mode: 'enforced', provider: 'codex', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
  };
  const rejected = [
    { ...gemini, reasoningEffort: 'medium' },
    { ...gemini, thinkingLevel: 'LOW' },
    { ...gemini, model: 'gemini-3.8-pro' },
    { ...gemini, model: undefined },
    { ...gemini, provider: 'gemini-cli' },
    { ...codex, thinkingLevel: 'MEDIUM' },
    { ...codex, reasoningEffort: undefined },
    { ...codex, provider: 'unknown' },
    { ...codex, model: 'gemini-3.8-flash' },
    { ...codex, authorityLimits: undefined },
    { ...codex, authorityManifestPath: undefined },
    { ...codex, ownerAddition: { grade: 'G0' } },
    { ...codex, ownerAmendment: { grade: 'G0' } },
    { ...codex, adoptionEvidence: { producer: 'github-actions' } },
    { ...codex, authorityLimits: { ...limits, maxMembers: 33 } },
    { ...codex, authorityManifestPath: '../authorities.json' },
    { ...codex, mode: 'procedural' },
  ];
  for (const branch of rejected) {
    assert.throws(() => resolveCiPolicy({ version: 6, default: { mode: 'local-only' }, branches: { main: branch } }, 'main'));
  }
  for (const defaultPolicy of [
    { mode: 'local-only', provider: 'gemini' },
    { mode: 'local-only', model: 'gemini-3.8-flash' },
    { mode: 'local-only', thinkingLevel: 'MEDIUM' },
  ]) assert.throws(() => resolveCiPolicy({ version: 6, default: defaultPolicy, branches: {} }, 'main'));
});

test('adding v6 leaves existing v2 policy output byte-for-byte in its legacy shape', () => {
  const legacy = policy();
  const selected = resolveCiPolicy(legacy, 'main');
  assert.deepEqual(selected, {
    baseBranch: 'main', mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimitsBase64: Buffer.from(JSON.stringify(limits)).toString('base64'),
  });
  assert.equal(Object.hasOwn(selected, 'provider'), false);
  assert.equal(Object.hasOwn(selected, 'policyVersion'), false);
});
