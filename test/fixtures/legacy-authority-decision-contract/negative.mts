import { validateLegacyAuthorityDecision } from '../../../src/ci-review/legacy-authority-decision.mts';
import { validateLegacyAuthorityDecision as flat } from '../../../src/prepare-legacy-ci-authority.mjs';
// Both existing arguments are required.
validateLegacyAuthorityDecision('{}');
// Unsupported argument arity.
flat('{}', {}, 'extra');
// Exact file matching does not establish a typed semantic decision.
const verified: { decision: 'PASS'; authorityFiles: string[] } = validateLegacyAuthorityDecision('{}', {});
void verified;
