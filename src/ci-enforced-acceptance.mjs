import { fileURLToPath } from 'node:url';
import { assertEnforcedAcceptance } from './ci-review/ci-enforced-acceptance.mts';

export { assertEnforcedAcceptance } from './ci-review/ci-enforced-acceptance.mts';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = assertEnforcedAcceptance({
    reviewResult: process.env.REVIEW_RESULT,
    conclusion: process.env.CONCLUSION,
    selfAuthorityCheckRequired: process.env.SELF_AUTHORITY_CHECK_REQUIRED,
    selectedAuthorityChanged: process.env.SELECTED_AUTHORITY_CHANGED,
    ownerAdditionSelected: process.env.OWNER_ADDITION_SELECTED,
    ownerAdditionResult: process.env.OWNER_ADDITION_RESULT,
    ownerAdditionEligibility: process.env.OWNER_ADDITION_ELIGIBILITY,
    ownerAmendmentSelected: process.env.OWNER_AMENDMENT_SELECTED,
    ownerAmendmentAttemptResult: process.env.OWNER_AMENDMENT_ATTEMPT_RESULT,
    ownerAmendmentAttempted: process.env.OWNER_AMENDMENT_ATTEMPTED,
    ownerAmendmentSignerResult: process.env.OWNER_AMENDMENT_SIGNER_RESULT,
    ownerAmendmentSignerStatus: process.env.OWNER_AMENDMENT_SIGNER_STATUS,
    ownerAmendmentEligibility: process.env.OWNER_AMENDMENT_ELIGIBILITY,
  });
  console.log(`Enforced CI acceptance route: ${result.route}`);
}
