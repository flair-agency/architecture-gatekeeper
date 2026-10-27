import { validateLegacyAuthorityDecision } from '../../../src/ci-review/legacy-authority-decision.mts';
import { validateLegacyAuthorityDecision as flat } from '../../../src/prepare-legacy-ci-authority.mts';
const provenance = { version: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedSha: 'c'.repeat(40), members: [{ path: 'docs/architecture.md', sha256: 'd'.repeat(64) }] };
const text = JSON.stringify({ decision: 'PASS', authorityFiles: ['docs/architecture.md'] });
const observed: unknown = validateLegacyAuthorityDecision(text, provenance);
const flatObserved: unknown = flat({ toString: () => text }, provenance);
const external: unknown = provenance;
validateLegacyAuthorityDecision(text, external);
void [observed, flatObserved];
