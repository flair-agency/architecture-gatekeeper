import { extractGeminiCliResponseText as extractFlat, validateGeminiCliResponse as validateFlat } from '../../../src/gemini-cli-response.mjs';
import { extractGeminiCliResponseText, validateGeminiCliResponse, type GeminiCliResponseLimits } from '../../../src/gemini-cli/gemini-cli-response.mts';
import type { ValidatedReviewDecision } from '../../../src/review-contract/review-contract.mts';

declare const externalProcessResult: unknown;
declare const request: unknown;
const limits: GeminiCliResponseLimits = { maxStdoutBytes: 4096, maxStderrBytes: 1024 };
const responseText: string = extractGeminiCliResponseText(externalProcessResult, limits);
const sameFlatText: string = extractFlat(externalProcessResult, limits);
const decision: ValidatedReviewDecision = validateGeminiCliResponse(externalProcessResult, request, limits);
const sameFlatDecision: ValidatedReviewDecision = validateFlat(externalProcessResult, request, limits);
const reviewedRevision: unknown = decision.reviewedRevision;
void [responseText, sameFlatText, sameFlatDecision, reviewedRevision];
