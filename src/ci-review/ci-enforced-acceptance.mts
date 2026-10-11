function fail(message: string): never { throw new Error(`Enforced CI acceptance: ${message}`); }

export interface AssertEnforcedAcceptanceInput {
  reviewResult: unknown;
  conclusion: unknown;
  ownerAdditionSelected?: unknown;
  ownerAdditionResult?: unknown;
  ownerAdditionEligibility?: unknown;
  ownerAmendmentSelected?: unknown;
  ownerAmendmentAttemptResult?: unknown;
  ownerAmendmentAttempted?: unknown;
  ownerAmendmentSignerResult?: unknown;
  ownerAmendmentSignerStatus?: unknown;
  ownerAmendmentEligibility?: unknown;
}

export type EnforcedAcceptanceRoute =
  | Readonly<{ route: 'ordinary-pass' }>
  | Readonly<{ route: 'owner-addition-pending' }>;

/** Preserve ordinary PASS, but do not let a tagged amendment attempt bypass its eligibility verifier. */
export function assertEnforcedAcceptance(input: AssertEnforcedAcceptanceInput): EnforcedAcceptanceRoute;
export function assertEnforcedAcceptance({ reviewResult, conclusion, ownerAdditionSelected,
  ownerAdditionResult, ownerAdditionEligibility, ownerAmendmentSelected, ownerAmendmentAttemptResult,
  ownerAmendmentAttempted, ownerAmendmentSignerResult, ownerAmendmentSignerStatus,
  ownerAmendmentEligibility }: AssertEnforcedAcceptanceInput = {} as AssertEnforcedAcceptanceInput): EnforcedAcceptanceRoute {
  if (reviewResult !== 'success') fail('the protected review did not complete successfully.');
  if (ownerAmendmentSelected === 'G0' &&
      (ownerAmendmentAttemptResult !== 'success' || !['true', 'false'].includes(ownerAmendmentAttempted as string))) {
    fail('the protected exact-B amendment-attempt classification is unavailable.');
  }
  const amendmentEligible = ownerAmendmentSignerResult === 'success' &&
    ownerAmendmentSignerStatus === 'prepared' && ownerAmendmentEligibility === 'ELIGIBLE';
  if (ownerAmendmentSelected === 'G0' && ownerAmendmentAttempted === 'true') {
    if (!amendmentEligible) {
      fail('a tagged OWNER_AMENDMENT attempt requires successful exact-B G0 eligibility before ordinary acceptance.');
    }
    fail('eligible tagged OWNER_AMENDMENT requires a separately implemented protected transition route; no accepting route is available.');
  }
  if (ownerAmendmentSelected === 'G0' && ownerAmendmentSignerResult === 'success') {
    fail('semantic eligibility signer success conflicts with the protected no-tag classification.');
  }
  if (conclusion === 'PASS') {
    return Object.freeze({ route: 'ordinary-pass' as const });
  }
  if (conclusion === 'OWNER_ADDITION_G0' && ownerAdditionSelected === 'G0' &&
      ownerAdditionResult === 'success' && ownerAdditionEligibility === 'ELIGIBLE') {
    return Object.freeze({ route: 'owner-addition-pending' as const });
  }
  fail('enforced acceptance requires model-backed PASS or verified selected G0 eligibility.');
}
