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

test('v6 rejects Gemini model families under Codex for default and named branches', () => {
  const branch = {
    mode: 'enforced', provider: 'codex', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
  };
  for (const model of ['gemini', 'gemini-2.5-pro', 'gemini-3.8-pro', 'gemini-3.8-flash', 'Gemini-future']) {
    const selection = { ...branch, model };
    assert.throws(() => resolveCiPolicy({ version: 6, default: selection, branches: {} }, 'main'), /Invalid Codex model/);
    assert.throws(() => resolveCiPolicy({ version: 6, default: { mode: 'local-only' }, branches: { main: selection } }, 'main'), /Invalid Codex model/);
  }
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

const execution = Object.freeze({
  reviewJobTimeoutMinutes: 7,
  reviewStepTimeoutMinutes: 5,
  codexProfile: 'standard',
});

function codexBranchForVersion(version, selectedExecution = execution) {
  if (version === 1) return {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityFiles: ['docs/architecture.md'], promptPath: '.codex/gatekeeper/prompt.md',
    schemaPath: '.codex/gatekeeper/schema.json', validationPath: null,
    ...(selectedExecution ? { execution: selectedExecution } : {}),
  };
  if (version === 6) return {
    mode: 'enforced', provider: 'codex', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
    ...(selectedExecution ? { execution: selectedExecution } : {}),
  };
  const branch = {
    mode: version === 5 ? 'procedural' : 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits,
    ownerAddition: { ...(version === 2 ? {} : { version: 2, authorityId: 'architecture' }), grade: 'G0',
      authorityPath: 'docs/architecture.md', promptPath: '.codex/gatekeeper/owner-addition.md',
      schemaPath: '.codex/gatekeeper/owner-addition.schema.json' },
    ...(version === 2 ? { ownerAmendment: amendment } : {}),
    ...(version === 5 ? { adoptionEvidence: {
      producer: 'github-actions', workflowPath: '.github/workflows/architecture-gate.yml',
      jobName: 'architecture-gate / report',
    } } : {}),
    ...(selectedExecution ? { execution: selectedExecution } : {}),
  };
  return branch;
}

function policyForVersion(version, branch) {
  return { version, default: { mode: 'local-only' }, branches: { main: branch } };
}

function executionOutputs(profile = 'standard') {
  const args = ['--ephemeral', '-c', 'project_doc_max_bytes=0'];
  if (profile === 'flex') args.push('-c', "service_tier='flex'");
  args.push('--json');
  return {
    executionSelection: 'policy', reviewJobTimeoutMinutes: 7, reviewStepTimeoutMinutes: 5,
    codexArgs: JSON.stringify(args),
  };
}

test('optional Codex execution selection resolves bounds and exact standard/flex Action args for policies v1, v2, v4, v5, and v6', () => {
  for (const version of [1, 2, 4, 5, 6]) {
    for (const codexProfile of ['standard', 'flex']) {
      const selected = resolveCiPolicy(policyForVersion(version,
        codexBranchForVersion(version, { ...execution, codexProfile })), 'main');
      assert.deepEqual({
        executionSelection: selected.executionSelection,
        reviewJobTimeoutMinutes: selected.reviewJobTimeoutMinutes,
        reviewStepTimeoutMinutes: selected.reviewStepTimeoutMinutes,
        codexArgs: selected.codexArgs,
      }, executionOutputs(codexProfile), `v${version} ${codexProfile}`);
    }
  }
});

test('execution selection preserves v2 owner amendment outputs and is absent from legacy resolved output when omitted', () => {
  const legacy = resolveCiPolicy(policyForVersion(2, codexBranchForVersion(2, null)), 'main');
  assert.equal(Object.hasOwn(legacy, 'executionSelection'), false);
  assert.equal(Object.hasOwn(legacy, 'reviewJobTimeoutMinutes'), false);
  assert.equal(Object.hasOwn(legacy, 'codexArgs'), false);
  assert.equal(legacy.ownerAmendmentVersion, 1);
  assert.equal(legacy.ownerAmendmentAuthorityId, 'architecture');

  const selected = resolveCiPolicy(policyForVersion(2, codexBranchForVersion(2)), 'main');
  assert.equal(selected.ownerAmendmentVersion, 1);
  assert.equal(selected.ownerAmendmentAuthorityId, 'architecture');
  assert.deepEqual({
    executionSelection: selected.executionSelection,
    reviewJobTimeoutMinutes: selected.reviewJobTimeoutMinutes,
    reviewStepTimeoutMinutes: selected.reviewStepTimeoutMinutes,
    codexArgs: selected.codexArgs,
  }, executionOutputs());

  const legacyV6 = codexBranchForVersion(6, null);
  const resolvedV6 = resolveCiPolicy(policyForVersion(6, legacyV6), 'main');
  assert.equal(Object.hasOwn(resolvedV6, 'executionSelection'), false);
  assert.equal(Object.hasOwn(resolvedV6, 'codexArgs'), false);
});

test('execution selections reject partial, unknown, invalid, out-of-range, or non-effective limits', () => {
  const invalid = [
    {},
    { ...execution, extra: true },
    { ...execution, reviewJobTimeoutMinutes: '7' },
    { ...execution, reviewJobTimeoutMinutes: 0 },
    { ...execution, reviewJobTimeoutMinutes: 361 },
    { ...execution, reviewStepTimeoutMinutes: 0 },
    { ...execution, reviewStepTimeoutMinutes: 360 },
    { ...execution, reviewJobTimeoutMinutes: 5, reviewStepTimeoutMinutes: 5 },
    { ...execution, reviewJobTimeoutMinutes: 4, reviewStepTimeoutMinutes: 5 },
    { ...execution, codexProfile: 'turbo' },
  ];
  for (const selectedExecution of invalid) {
    for (const version of [1, 2, 4, 5, 6]) {
      assert.throws(() => resolveCiPolicy(policyForVersion(version,
        codexBranchForVersion(version, selectedExecution)), 'main'), undefined, `v${version}: ${JSON.stringify(selectedExecution)}`);
    }
  }
  for (const version of [1, 2, 4, 5, 6]) {
    assert.throws(() => resolveCiPolicy(policyForVersion(version,
      { mode: 'local-only', execution }), 'main'));
  }
});

test('v6 rejects a Codex execution selection on the Gemini branch', () => {
  const gemini = {
    mode: 'enforced', provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: limits, execution,
  };
  assert.throws(() => resolveCiPolicy(policyForVersion(6, gemini), 'main'), /only supported for Codex/);
});
