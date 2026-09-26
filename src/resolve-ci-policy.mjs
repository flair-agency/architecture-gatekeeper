#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MULTI_AUTHORITY_PROFILE, rejectDuplicateJsonKeys, validateAuthorityLimits } from './authority-set.mjs';

const MODES = new Set(['enforced', 'local-only', 'procedural']);
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;
const OWNER_AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const OWNER_SCHEMA_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;
const ADOPTION_WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/;
const ADOPTION_JOB_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63} \/ [A-Za-z0-9_][A-Za-z0-9 ._-]{0,63}$/;
const LEGACY_AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireOnlyKeys(value, allowed, label) {
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${label} field: ${key}`);
  }
}

function validateBranch(branch, label, version) {
  const allowed = version === 1 ? ['mode', 'model', 'reasoningEffort', 'authorityFiles', 'promptPath', 'schemaPath', 'validationPath'] :
    ['mode', 'model', 'reasoningEffort', 'authorityManifestPath', 'authorityLimits', 'ownerAddition', ...(version === 5 ? ['adoptionEvidence'] : [])];
  requireOnlyKeys(branch, new Set(allowed), label);
  if (!MODES.has(branch.mode)) throw new Error(`Invalid ${label} mode`);
  if (branch.mode === 'local-only') {
    if (Object.keys(branch).length !== 1) throw new Error(`Invalid ${label}`);
    return;
  }
  if (version === 5 && branch.mode !== 'procedural') throw new Error(`${label} v5 requires procedural mode`);
  if (version !== 5 && branch.mode === 'procedural') throw new Error(`${label} procedural mode requires CI policy v5`);
  if (typeof branch.model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(branch.model)) {
    throw new Error(`${branch.mode === 'procedural' ? 'Procedural' : 'Enforced'} ${label} requires a valid model`);
  }
  if (!EFFORTS.has(branch.reasoningEffort)) throw new Error(`Invalid reasoning effort for ${label}`);
  if (version === 1) {
    if (typeof branch.promptPath !== 'string' || branch.promptPath.length > 240 ||
        !OWNER_AUTHORITY_PATH.test(branch.promptPath) || branch.promptPath.split('/').some(part => part === '.' || part === '..') ||
        typeof branch.schemaPath !== 'string' || branch.schemaPath.length > 240 ||
        !OWNER_SCHEMA_PATH.test(branch.schemaPath) || branch.schemaPath.split('/').some(part => part === '.' || part === '..')) {
      throw new Error(`Enforced ${label} requires base-selected promptPath and schemaPath`);
    }
    if (!Object.hasOwn(branch, 'validationPath') || (branch.validationPath !== null &&
        (typeof branch.validationPath !== 'string' || branch.validationPath.length > 240 ||
          !OWNER_SCHEMA_PATH.test(branch.validationPath) ||
          branch.validationPath.split('/').some(part => part === '.' || part === '..')))) {
      throw new Error(`Enforced ${label} requires an explicit base-selected validationPath or null`);
    }
    if (!Array.isArray(branch.authorityFiles) || branch.authorityFiles.length < 1 || branch.authorityFiles.length > 16 ||
        new Set(branch.authorityFiles).size !== branch.authorityFiles.length ||
        branch.authorityFiles.some(path => typeof path !== 'string' || path.length > 240 ||
          !LEGACY_AUTHORITY_PATH.test(path) || path.split('/').some(part => part === '.' || part === '..'))) {
      throw new Error(`Enforced ${label} requires explicit base-selected authorityFiles`);
    }
  }
  if (version === 2 || version === 4 || version === 5) {
    if (Object.hasOwn(branch, 'ownerAddition')) {
      requireOnlyKeys(branch.ownerAddition, new Set(['grade', 'authorityPath', 'promptPath', 'schemaPath', ...([4, 5].includes(version) ? ['version', 'authorityId'] : [])]), `${label} owner addition`);
      if ([4, 5].includes(version) && (branch.ownerAddition.version !== 2 ||
          !/^[a-z][a-z0-9-]{0,63}$/.test(branch.ownerAddition.authorityId || ''))) {
        throw new Error(`${label} v${version} requires version 2 owner addition and an affected authorityId`);
      }
      if (branch.ownerAddition.grade !== 'G0' ||
          typeof branch.ownerAddition.authorityPath !== 'string' ||
          branch.ownerAddition.authorityPath.length > 240 ||
          !OWNER_AUTHORITY_PATH.test(branch.ownerAddition.authorityPath) ||
          branch.ownerAddition.authorityPath.split('/').some(part => part === '.' || part === '..') ||
          typeof branch.ownerAddition.promptPath !== 'string' ||
          branch.ownerAddition.promptPath.length > 240 ||
          !OWNER_AUTHORITY_PATH.test(branch.ownerAddition.promptPath) ||
          branch.ownerAddition.promptPath.split('/').some(part => part === '.' || part === '..') ||
          typeof branch.ownerAddition.schemaPath !== 'string' ||
          branch.ownerAddition.schemaPath.length > 240 ||
          !OWNER_SCHEMA_PATH.test(branch.ownerAddition.schemaPath) ||
          branch.ownerAddition.schemaPath.split('/').some(part => part === '.' || part === '..')) {
        throw new Error(`Invalid ${label} owner addition`);
      }
    }
    const hasPath = Object.hasOwn(branch, 'authorityManifestPath');
    const hasLimits = Object.hasOwn(branch, 'authorityLimits');
    if (hasPath !== hasLimits) throw new Error(`${label} must specify both Authority Set path and limits`);
    if (Object.hasOwn(branch, 'ownerAddition') && !hasPath) {
      throw new Error(`${label} owner addition requires a protected Authority Set`);
    }
    if ([4, 5].includes(version) && !Object.hasOwn(branch, 'ownerAddition')) throw new Error(`${label} v${version} requires explicit multi-document owner addition`);
    if (hasPath) {
      if (typeof branch.authorityManifestPath !== 'string' || branch.authorityManifestPath.length > 240 ||
          !AUTHORITY_PATH.test(branch.authorityManifestPath) || branch.authorityManifestPath.split('/').some(part => part === '.' || part === '..')) {
        throw new Error(`Invalid Authority Set manifest path for ${label}`);
      }
      validateAuthorityLimits(branch.authorityLimits, [4, 5].includes(version) ? MULTI_AUTHORITY_PROFILE : 'v1');
    }
  }
  if (version === 5) {
    const evidence = branch.adoptionEvidence;
    requireOnlyKeys(evidence, new Set(['producer', 'workflowPath', 'jobName']), `${label} adoption evidence`);
    if (branch.mode !== 'procedural' || evidence.producer !== 'github-actions' ||
        typeof evidence.workflowPath !== 'string' || evidence.workflowPath.length > 240 ||
        !ADOPTION_WORKFLOW_PATH.test(evidence.workflowPath) ||
        evidence.workflowPath.split('/').some(part => part === '.' || part === '..') ||
        typeof evidence.jobName !== 'string' || evidence.jobName.length > 131 || !ADOPTION_JOB_NAME.test(evidence.jobName)) {
      throw new Error(`Invalid ${label} adoption evidence`);
    }
  } else if (Object.hasOwn(branch, 'adoptionEvidence')) {
    throw new Error(`${label} adoption evidence requires CI policy v5`);
  }
}

export function resolveCiPolicy(policy, baseBranch) {
  if (!isRecord(policy) || ![1, 2, 4, 5].includes(policy.version)) throw new Error('Unsupported Architecture Gate CI policy version');
  requireOnlyKeys(policy, new Set(['version', 'default', 'branches']), 'CI policy');
  if (!baseBranch || typeof baseBranch !== 'string') throw new Error('A base branch is required');
  if (!isRecord(policy.default)) throw new Error('CI policy requires default');
  if (!isRecord(policy.branches)) {
    throw new Error('CI policy requires a branches object');
  }
  validateBranch(policy.default, 'CI policy default', policy.version);
  for (const [branchName, branch] of Object.entries(policy.branches)) {
    validateBranch(branch, `CI policy branch ${branchName}`, policy.version);
  }
  const selected = Object.hasOwn(policy.branches, baseBranch) ? policy.branches[baseBranch] : policy.default;
  const result = selected.mode === 'local-only'
    ? { baseBranch, mode: 'local-only', model: '', reasoningEffort: '' }
    : { baseBranch, mode: selected.mode, model: selected.model, reasoningEffort: selected.reasoningEffort };
  if (policy.version === 1 && selected.mode === 'enforced') {
    result.policyVersion = 1;
    result.legacyAuthorityFilesBase64 = Buffer.from(JSON.stringify(selected.authorityFiles)).toString('base64');
    result.legacyPromptPath = selected.promptPath;
    result.legacySchemaPath = selected.schemaPath;
    result.legacyValidationPath = selected.validationPath ?? '';
  }
  if (selected.authorityManifestPath) {
    result.authorityManifestPath = selected.authorityManifestPath;
    const profile = [4, 5].includes(policy.version) ? MULTI_AUTHORITY_PROFILE : 'v1';
    result.authorityLimitsBase64 = Buffer.from(JSON.stringify(validateAuthorityLimits(selected.authorityLimits, profile))).toString('base64');
    if ([4, 5].includes(policy.version)) result.authorityProfile = profile;
  }
  if (selected.ownerAddition) {
    if ([4, 5].includes(policy.version)) {
      result.policyVersion = policy.version;
      result.ownerAdditionVersion = 2;
      result.ownerAdditionAuthorityId = selected.ownerAddition.authorityId;
    }
    result.ownerAdditionAuthorityPath = selected.ownerAddition.authorityPath;
    result.ownerAdditionGrade = selected.ownerAddition.grade;
    result.ownerAdditionPromptPath = selected.ownerAddition.promptPath;
    result.ownerAdditionSchemaPath = selected.ownerAddition.schemaPath;
  }
  if (policy.version === 5 && selected.mode === 'procedural') {
    result.adoptionEvidenceProducer = selected.adoptionEvidence.producer;
    result.adoptionEvidenceWorkflowPath = selected.adoptionEvidence.workflowPath;
    result.adoptionEvidenceJobName = selected.adoptionEvidence.jobName;
  }
  return result;
}

export function parseCiPolicyJson(source) {
  rejectDuplicateJsonKeys(source, 'CI policy');
  return JSON.parse(source);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [policyPath, baseBranch] = process.argv.slice(2);
  if (!policyPath) throw new Error('Usage: architecture-gate-policy <policy> <base-branch>');
  const result = resolveCiPolicy(parseCiPolicyJson(readFileSync(policyPath, 'utf8')), baseBranch);
  for (const [name, value] of Object.entries(result)) process.stdout.write(`${name}=${value}\n`);
}
