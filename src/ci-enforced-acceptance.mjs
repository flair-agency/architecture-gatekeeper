import { fileURLToPath } from 'node:url';

function fail(message) { throw new Error(`Enforced CI acceptance: ${message}`); }

/** Preserve ordinary PASS, but do not let a tagged amendment attempt bypass its eligibility verifier. */
export function assertEnforcedAcceptance({ reviewResult, conclusion, ownerAdditionSelected,
  ownerAdditionResult, ownerAdditionEligibility, ownerAmendmentSelected, ownerAmendmentAttemptResult,
  ownerAmendmentAttempted, ownerAmendmentSignerResult, ownerAmendmentSignerStatus,
  ownerAmendmentEligibility } = {}) {
  if (reviewResult !== 'success') fail('the protected review did not complete successfully.');
  if (ownerAmendmentSelected === 'G0' &&
      (ownerAmendmentAttemptResult !== 'success' || !['true', 'false'].includes(ownerAmendmentAttempted))) {
    fail('the protected exact-B amendment-attempt classification is unavailable.');
  }
  if (conclusion === 'PASS') {
    if (ownerAmendmentSelected === 'G0' && ownerAmendmentAttempted === 'true' &&
        (ownerAmendmentSignerResult !== 'success' || ownerAmendmentSignerStatus !== 'prepared' ||
         ownerAmendmentEligibility !== 'ELIGIBLE')) {
      fail('a tagged OWNER_AMENDMENT attempt requires successful exact-B G0 eligibility before ordinary PASS can be accepted.');
    }
    return Object.freeze({ route: ownerAmendmentSelected === 'G0' && ownerAmendmentAttempted === 'true'
      ? 'owner-amendment-pending' : 'ordinary-pass' });
  }
  if (ownerAmendmentSelected === 'G0' && ownerAmendmentSignerResult === 'success' &&
      ownerAmendmentSignerStatus === 'prepared' && ownerAmendmentEligibility === 'ELIGIBLE') {
    return Object.freeze({ route: 'owner-amendment-pending' });
  }
  if (conclusion === 'OWNER_ADDITION_G0' && ownerAdditionSelected === 'G0' &&
      ownerAdditionResult === 'success' && ownerAdditionEligibility === 'ELIGIBLE') {
    return Object.freeze({ route: 'owner-addition-pending' });
  }
  fail('enforced acceptance requires model-backed PASS or verified selected G0 eligibility.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = assertEnforcedAcceptance({
    reviewResult: process.env.REVIEW_RESULT,
    conclusion: process.env.CONCLUSION,
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
