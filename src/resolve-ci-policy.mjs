#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MODES = new Set(['enforced', 'local-only']);
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireOnlyKeys(value, allowed, label) {
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${label} field: ${key}`);
  }
}

function validateBranch(branch, label) {
  requireOnlyKeys(branch, new Set(['mode', 'model', 'reasoningEffort']), label);
  if (!MODES.has(branch.mode)) throw new Error(`Invalid ${label} mode`);
  if (branch.mode === 'local-only') {
    if (Object.keys(branch).length !== 1) throw new Error(`Invalid ${label}`);
    return;
  }
  if (typeof branch.model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(branch.model)) {
    throw new Error(`Enforced ${label} requires a valid model`);
  }
  if (!EFFORTS.has(branch.reasoningEffort)) throw new Error(`Invalid reasoning effort for ${label}`);
}

export function resolveCiPolicy(policy, baseBranch) {
  if (!isRecord(policy) || policy.version !== 1) throw new Error('Unsupported Architecture Gate CI policy version');
  requireOnlyKeys(policy, new Set(['version', 'default', 'branches']), 'CI policy');
  if (!baseBranch || typeof baseBranch !== 'string') throw new Error('A base branch is required');
  if (!isRecord(policy.default)) throw new Error('CI policy requires default');
  if (!isRecord(policy.branches)) {
    throw new Error('CI policy requires a branches object');
  }
  validateBranch(policy.default, 'CI policy default');
  for (const [branchName, branch] of Object.entries(policy.branches)) {
    validateBranch(branch, `CI policy branch ${branchName}`);
  }
  const selected = Object.hasOwn(policy.branches, baseBranch) ? policy.branches[baseBranch] : policy.default;
  if (selected.mode === 'local-only') return { baseBranch, mode: 'local-only', model: '', reasoningEffort: '' };
  return { baseBranch, mode: 'enforced', model: selected.model, reasoningEffort: selected.reasoningEffort };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [policyPath, baseBranch] = process.argv.slice(2);
  if (!policyPath) throw new Error('Usage: architecture-gate-policy <policy> <base-branch>');
  const result = resolveCiPolicy(JSON.parse(readFileSync(policyPath, 'utf8')), baseBranch);
  for (const [name, value] of Object.entries(result)) process.stdout.write(`${name}=${value}\n`);
}
