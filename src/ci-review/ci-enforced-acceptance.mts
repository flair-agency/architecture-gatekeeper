function fail(message: string): never { throw new Error(`Enforced CI acceptance: ${message}`); }

export interface AssertEnforcedAcceptanceInput {
  reviewResult: unknown;
  conclusion: unknown;
  selfAuthorityCheckRequired?: unknown;
  selectedAuthorityChanged?: unknown;
  ownerAdditionSelected?: unknown;
  ownerAdditionResult?: unknown;
  ownerAdditionEligibility?: unknown;
  ownerAmendmentSelected?: unknown;
  ownerAmendmentResult?: unknown;
  ownerAmendmentVerification?: unknown;
}

export type EnforcedAcceptanceRoute =
  | Readonly<{ route: 'ordinary-pass' }>
  | Readonly<{ route: 'owner-addition-pending' }>
  | Readonly<{ route: 'owner-amendment-eligible' }>;

/** Inputs are outputs/outcomes of the adopted workflow, never candidate-supplied evidence. */
export function assertEnforcedAcceptance({ reviewResult, conclusion, ownerAdditionSelected,
  ownerAdditionResult, ownerAdditionEligibility, ownerAmendmentSelected, ownerAmendmentResult,
  ownerAmendmentVerification, selfAuthorityCheckRequired, selectedAuthorityChanged }: AssertEnforcedAcceptanceInput): EnforcedAcceptanceRoute {
  if (reviewResult !== 'success') fail('the protected review did not complete successfully.');
  if (!['PASS', 'BLOCK', 'OWNER_DECISION', 'OWNER_ADDITION_G0'].includes(conclusion as string)) {
    fail('enforced acceptance requires model-backed PASS or a verified selected Owner procedure.');
  }
  const requireAuthorityCheck = selfAuthorityCheckRequired === 'true' || ownerAmendmentSelected === 'protected-pr';
  if (requireAuthorityCheck && !['true', 'false'].includes(selectedAuthorityChanged as string)) {
    fail('the protected selected-Authority change comparison is unavailable.');
  }
  // Addition retains its independently validated, monotonic procedure. It is not an ordinary PASS.
  if (conclusion === 'OWNER_ADDITION_G0' && ownerAdditionSelected === 'G0' &&
      ownerAdditionResult === 'success' && ownerAdditionEligibility === 'ELIGIBLE') {
    return Object.freeze({ route: 'owner-addition-pending' as const });
  }
  if (selectedAuthorityChanged === 'true' && requireAuthorityCheck) {
    if (ownerAmendmentSelected !== 'protected-pr' || ownerAmendmentResult !== 'success' ||
        ownerAmendmentVerification !== 'success') {
      fail('ordinary PASS cannot accept a change to the previous selected Authority Set; the selected amendment review and exact current-PR verification are required.');
    }
    return Object.freeze({ route: 'owner-amendment-eligible' as const });
  }
  if (ownerAmendmentVerification === 'success') fail('amendment verification conflicts with an unchanged Authority Set.');
  if (conclusion === 'PASS') return Object.freeze({ route: 'ordinary-pass' as const });
  fail('enforced acceptance requires model-backed PASS or a verified selected Owner procedure.');
}
