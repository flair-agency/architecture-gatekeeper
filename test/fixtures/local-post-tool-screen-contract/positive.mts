import { runPostToolScreenHook as flatRun } from '../../../src/local-post-tool-screen.mjs';
import {
  runPostToolScreenHook,
  runPostToolScreenHookCli,
  type PostToolScreenOptions,
} from '../../../src/local-review/local-post-tool-screen.mts';
import type { PreparedReviewRequest } from '../../../src/review-contract/review-contract.mts';
import type { LocalReviewerControls } from '../../../src/reviewer-transports/local-reviewer-execution.mts';

declare const external: unknown;
const rawOptions: PostToolScreenOptions = {
  cwd: '/repo',
  batchDelayMs: 0,
  reviewer: async (request: PreparedReviewRequest, controls: LocalReviewerControls) => {
    const deadline: number = request.reviewer.reviewTimeoutMs;
    const signal: AbortSignal = controls.signal;
    void [deadline, signal];
    return external;
  },
};
const envelopeOptions: PostToolScreenOptions = {
  reviewerResultFormat: 'envelope',
  reviewer: (_request, _controls) => Promise.resolve({ decision: external, execution: external }),
};
const result = runPostToolScreenHook(external, rawOptions);
const flatResult = flatRun(external, envelopeOptions);
const cli: void = runPostToolScreenHookCli();
void [result, flatResult, cli];
