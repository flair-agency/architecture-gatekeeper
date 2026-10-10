import { validateReviewResponse } from '../../../src/review-contract.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../../../src/resolve-ci-policy.mjs';

const result = validateReviewResponse({} as unknown, {});
const trustedDecision: string = result.decision;
const trustedRevision: string = result.reviewedRevision;
const parsed = parseCiPolicyJson('{}');
const selected = resolveCiPolicy(parsed, 'main');
const trustedMode: 'enforced' | 'procedural' | 'local-only' = selected.mode;
const trustedModel: string = selected.model;
void [trustedDecision, trustedRevision, trustedMode, trustedModel];
