#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCiPolicyJson, resolveCiPolicy } from './authority-validation/resolve-ci-policy.mts';

export { parseCiPolicyJson, resolveCiPolicy };

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [policyPath, baseBranch] = process.argv.slice(2);
  if (!policyPath) throw new Error('Usage: architecture-gate-policy <policy> <base-branch>');
  const result = resolveCiPolicy(parseCiPolicyJson(readFileSync(policyPath, 'utf8')), baseBranch);
  for (const [name, value] of Object.entries(result)) process.stdout.write(`${name}=${value}\n`);
}
