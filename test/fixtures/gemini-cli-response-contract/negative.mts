import { extractGeminiCliResponseText, validateGeminiCliResponse } from '../../../src/gemini-cli-response.mts';

declare const externalProcessResult: unknown;
declare const request: unknown;
// @ts-expect-error The public limit argument is mandatory even though the implementation retains its empty-object default.
extractGeminiCliResponseText(externalProcessResult);
// @ts-expect-error Neither required byte limit may be omitted.
extractGeminiCliResponseText(externalProcessResult, { maxStdoutBytes: 4096 });
// @ts-expect-error Both configured ceilings must be numeric byte limits.
extractGeminiCliResponseText(externalProcessResult, { maxStdoutBytes: '4096', maxStderrBytes: 1024 });
// @ts-expect-error Validation requires its existing third limits argument.
validateGeminiCliResponse(externalProcessResult, request);
const validated = validateGeminiCliResponse(externalProcessResult, request, { maxStdoutBytes: 4096, maxStderrBytes: 1024 });
// @ts-expect-error Reviewed request observations stay unknown after existing validation.
const reviewedRevision: string = validated.reviewedRevision;
void reviewedRevision;
