#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MODES = new Set(['enforced', 'local-only']);
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

export function resolveCiPolicy(policy, baseBranch) {
  if (policy?.version !== 1) throw new Error('Unsupported Architecture Gate CI policy version');
  if (!baseBranch || typeof baseBranch !== 'string') throw new Error('A base branch is required');
  if (!policy.default || typeof policy.default !== 'object') throw new Error('CI policy requires default');
  if (!policy.branches || typeof policy.branches !== 'object' || Array.isArray(policy.branches)) {
    throw new Error('CI policy requires a branches object');
  }
  const selected = Object.hasOwn(policy.branches, baseBranch) ? policy.branches[baseBranch] : policy.default;
  if (!selected || !MODES.has(selected.mode)) throw new Error(`Invalid CI gate mode for ${baseBranch}`);
  if (selected.mode === 'local-only') return { baseBranch, mode: 'local-only', model: '', reasoningEffort: '' };
  if (typeof selected.model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(selected.model)) {
    throw new Error(`Enforced CI policy for ${baseBranch} requires a valid model`);
  }
  if (!EFFORTS.has(selected.reasoningEffort)) throw new Error(`Invalid reasoning effort for ${baseBranch}`);
  return { baseBranch, mode: 'enforced', model: selected.model, reasoningEffort: selected.reasoningEffort };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [policyPath, baseBranch] = process.argv.slice(2);
  if (!policyPath) throw new Error('Usage: architecture-gate-policy <policy> <base-branch>');
  const result = resolveCiPolicy(JSON.parse(readFileSync(policyPath, 'utf8')), baseBranch);
  for (const [name, value] of Object.entries(result)) process.stdout.write(`${name}=${value}\n`);
}
