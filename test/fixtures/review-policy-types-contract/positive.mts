import { validateReviewResponse } from '../../../src/review-contract.mjs';
import type { ReviewRequestV1, ReviewRequestV2 } from '../../../src/review-contract.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../../../src/resolve-ci-policy.mjs';

const decision: unknown = JSON.parse('{"decision":"PASS"}');
const response: unknown = validateReviewResponse({} as unknown, decision);
const parsed: unknown = parseCiPolicyJson('{"version":1}');
const selected = resolveCiPolicy(parsed, 'main');
const mode: unknown = selected.mode;
const branch: string = selected.baseBranch;
const model: unknown = selected.model;
const encodedLimits: string | undefined = selected.authorityLimitsBase64;
const reviewer = { model: 'gpt-6.1-sol', reasoningEffort: 'low' };
const legacy: ReviewRequestV1 = { version: 1, repositoryRoot: '/repo', reviewedRevision: 'a'.repeat(40), task: 'review', prompt: '', schema: {}, reviewer, requestId: 'id' };
const distributed: ReviewRequestV2 = { ...legacy, version: 2, authoritySet: {} };
const revision: string = distributed.reviewedRevision;
const reviewerModel: string = legacy.reviewer.model;
void [response, mode, branch, model, encodedLimits, revision, reviewerModel];
