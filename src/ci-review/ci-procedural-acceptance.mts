export type ProceduralV5AcceptanceInput = {
  policyVersion: unknown;
  evidenceProducer: unknown;
  reviewResult: unknown;
  conclusion: unknown;
  selectedAuthorityChanged: unknown;
  ownerAdditionSelected?: unknown;
  ownerAdditionResult?: unknown;
  ownerAdditionEligibility?: unknown;
};

export type ProceduralV5AcceptanceRoute =
  | { route: 'ordinary-pass' }
  | { route: 'owner-addition-pending' };

/** Validate the only v5 procedural acceptance outcomes. */
export function assertProceduralV5Acceptance({ policyVersion, evidenceProducer, reviewResult, conclusion,
  selectedAuthorityChanged, ownerAdditionSelected, ownerAdditionResult, ownerAdditionEligibility }: ProceduralV5AcceptanceInput): ProceduralV5AcceptanceRoute {
  if (policyVersion !== '5' || evidenceProducer !== 'github-actions' || reviewResult !== 'success') {
    throw new Error('Procedural v5 acceptance requires its selected policy, producer and completed review.');
  }
  if (selectedAuthorityChanged === 'false') {
    if (conclusion !== 'PASS') throw new Error('A procedural decision without selected-authority changes must be PASS.');
    return { route: 'ordinary-pass' };
  }
  if (selectedAuthorityChanged === 'true' && conclusion === 'OWNER_ADDITION_G0_PENDING' &&
      ownerAdditionSelected === 'G0' && ownerAdditionResult === 'success' && ownerAdditionEligibility === 'ELIGIBLE') {
    return { route: 'owner-addition-pending' };
  }
  throw new Error('A candidate that changes selected authority requires successful OWNER_ADDITION / G0 eligibility; ordinary PASS is not accepted.');
}


export function runProceduralV5AcceptanceCli(): void {
  const result = assertProceduralV5Acceptance({
    policyVersion: process.env.POLICY_VERSION,
    evidenceProducer: process.env.EVIDENCE_PRODUCER,
    reviewResult: process.env.REVIEW_RESULT,
    conclusion: process.env.CONCLUSION,
    selectedAuthorityChanged: process.env.SELECTED_AUTHORITY_CHANGED,
    ownerAdditionSelected: process.env.OWNER_ADDITION_SELECTED,
    ownerAdditionResult: process.env.OWNER_ADDITION_RESULT,
    ownerAdditionEligibility: process.env.OWNER_ADDITION_ELIGIBILITY,
  });
  console.log(`Procedural v5 acceptance route: ${result.route}`);
}
