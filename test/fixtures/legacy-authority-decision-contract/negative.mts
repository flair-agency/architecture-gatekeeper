import { validateLegacyAuthorityDecision } from '../../../src/ci-review/legacy-authority-decision.mts';
import { validateLegacyAuthorityDecision as flat } from '../../../src/prepare-legacy-ci-authority.mts';
// @ts-expect-error Both existing arguments are required.
validateLegacyAuthorityDecision('{}');
// @ts-expect-error Unsupported argument arity.
flat('{}', {}, 'extra');
// @ts-expect-error Exact file matching does not establish a typed semantic decision.
const verified: { decision: 'PASS'; authorityFiles: string[] } = validateLegacyAuthorityDecision('{}', {});
void verified;
