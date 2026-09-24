#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rejectDuplicateJsonKeys, validateAuthorityLimits } from './authority-set.mjs';

const MODES = new Set(['enforced', 'local-only']);
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;

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
  requireOnlyKeys(branch, version === 1 ? new Set(['mode', 'model', 'reasoningEffort']) : new Set(['mode', 'model', 'reasoningEffort', 'authorityManifestPath', 'authorityLimits']), label);
  if (!MODES.has(branch.mode)) throw new Error(`Invalid ${label} mode`);
  if (branch.mode === 'local-only') {
    if (Object.keys(branch).length !== 1) throw new Error(`Invalid ${label}`);
    return;
  }
  if (typeof branch.model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(branch.model)) {
    throw new Error(`Enforced ${label} requires a valid model`);
  }
  if (!EFFORTS.has(branch.reasoningEffort)) throw new Error(`Invalid reasoning effort for ${label}`);
  if (version === 2) {
    const hasPath = Object.hasOwn(branch, 'authorityManifestPath');
    const hasLimits = Object.hasOwn(branch, 'authorityLimits');
    if (hasPath !== hasLimits) throw new Error(`${label} must specify both Authority Set path and limits`);
    if (hasPath) {
      if (typeof branch.authorityManifestPath !== 'string' || branch.authorityManifestPath.length > 240 ||
          !AUTHORITY_PATH.test(branch.authorityManifestPath) || branch.authorityManifestPath.split('/').some(part => part === '.' || part === '..')) {
        throw new Error(`Invalid Authority Set manifest path for ${label}`);
      }
      validateAuthorityLimits(branch.authorityLimits);
    }
  }
}

export function resolveCiPolicy(policy, baseBranch) {
  if (!isRecord(policy) || ![1, 2].includes(policy.version)) throw new Error('Unsupported Architecture Gate CI policy version');
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
  if (selected.authorityManifestPath) {
    result.authorityManifestPath = selected.authorityManifestPath;
    result.authorityLimitsBase64 = Buffer.from(JSON.stringify(validateAuthorityLimits(selected.authorityLimits))).toString('base64');
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
