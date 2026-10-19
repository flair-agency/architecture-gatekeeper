#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { trustedGitHubWorkspaceRoot } from './github-runner-workspace.mjs';
import { prepare, resolveSingleOwnerAdditionAuthorityId, validateOwnerAdditionCiCli } from './owner-addition/owner-addition-ci-operations.mts';
import { validateOwnerAdditionEligibility, validateOwnerAdditionEligibilitySchema,
  validateOrdinaryOwnerDecision, validateOrdinaryOwnerDecisionSchema } from './owner-addition-validation.mjs';
export { resolveSingleOwnerAdditionAuthorityId, validateOwnerAdditionEligibility, validateOwnerAdditionEligibilitySchema,
  validateOrdinaryOwnerDecision, validateOrdinaryOwnerDecisionSchema };

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'prepare') await prepare({ ...process.env, GITHUB_WORKSPACE: trustedGitHubWorkspaceRoot() });
  else if (process.argv[2] === 'validate') validateOwnerAdditionCiCli();
  else throw new Error('Usage: owner-addition-ci.mjs prepare|validate');
}
