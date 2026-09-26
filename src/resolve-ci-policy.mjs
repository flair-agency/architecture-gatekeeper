#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MULTI_AUTHORITY_PROFILE, rejectDuplicateJsonKeys, validateAuthorityLimits } from './authority-set.mjs';

const MODES = new Set(['enforced', 'local-only']);
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;
const OWNER_AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const OWNER_SCHEMA_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;
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
  requireOnlyKeys(branch, version === 1 ? new Set(['mode', 'model', 'reasoningEffort', 'authorityFiles', 'promptPath', 'schemaPath', 'validationPath']) : new Set(['mode', 'model', 'reasoningEffort', 'authorityManifestPath', 'authorityLimits', 'ownerAddition']), label);
  if (!MODES.has(branch.mode)) throw new Error(`Invalid ${label} mode`);
  if (branch.mode === 'local-only') {
    if (Object.keys(branch).length !== 1) throw new Error(`Invalid ${label}`);
    return;
  }
  if (typeof branch.model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(branch.model)) {
    throw new Error(`Enforced ${label} requires a valid model`);
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
  if (version === 2 || version === 4) {
    if (Object.hasOwn(branch, 'ownerAddition')) {
      requireOnlyKeys(branch.ownerAddition, new Set(['grade', 'authorityPath', 'promptPath', 'schemaPath', ...(version === 4 ? ['version', 'authorityId'] : [])]), `${label} owner addition`);
      if (version === 4 && (branch.ownerAddition.version !== 2 ||
          !/^[a-z][a-z0-9-]{0,63}$/.test(branch.ownerAddition.authorityId || ''))) {
        throw new Error(`${label} v4 requires version 2 owner addition and an affected authorityId`);
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
    if (version === 4 && !Object.hasOwn(branch, 'ownerAddition')) throw new Error(`${label} v4 requires explicit multi-document owner addition`);
    if (hasPath) {
      if (typeof branch.authorityManifestPath !== 'string' || branch.authorityManifestPath.length > 240 ||
          !AUTHORITY_PATH.test(branch.authorityManifestPath) || branch.authorityManifestPath.split('/').some(part => part === '.' || part === '..')) {
        throw new Error(`Invalid Authority Set manifest path for ${label}`);
      }
      validateAuthorityLimits(branch.authorityLimits, version === 4 ? MULTI_AUTHORITY_PROFILE : 'v1');
    }
  }
}

export function resolveCiPolicy(policy, baseBranch) {
  if (!isRecord(policy) || ![1, 2, 4].includes(policy.version)) throw new Error('Unsupported Architecture Gate CI policy version');
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
    : { baseBranch, mode: 'enforced', model: selected.model, reasoningEffort: selected.reasoningEffort };
  if (policy.version === 1 && selected.mode === 'enforced') {
    result.policyVersion = 1;
    result.legacyAuthorityFilesBase64 = Buffer.from(JSON.stringify(selected.authorityFiles)).toString('base64');
    result.legacyPromptPath = selected.promptPath;
    result.legacySchemaPath = selected.schemaPath;
    result.legacyValidationPath = selected.validationPath ?? '';
  }
  if (selected.authorityManifestPath) {
    result.authorityManifestPath = selected.authorityManifestPath;
    const profile = policy.version === 4 ? MULTI_AUTHORITY_PROFILE : 'v1';
    result.authorityLimitsBase64 = Buffer.from(JSON.stringify(validateAuthorityLimits(selected.authorityLimits, profile))).toString('base64');
    if (policy.version === 4) result.authorityProfile = profile;
  }
  if (selected.ownerAddition) {
    if (policy.version === 4) {
      result.policyVersion = 4;
      result.ownerAdditionVersion = 2;
      result.ownerAdditionAuthorityId = selected.ownerAddition.authorityId;
    }
    result.ownerAdditionAuthorityPath = selected.ownerAddition.authorityPath;
    result.ownerAdditionGrade = selected.ownerAddition.grade;
    result.ownerAdditionPromptPath = selected.ownerAddition.promptPath;
    result.ownerAdditionSchemaPath = selected.ownerAddition.schemaPath;
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
