import { runNativeReviewCli } from '../../../src/native-review.mjs';

const callable: (argv?: string[], cwd?: string) => Promise<void> = runNativeReviewCli;
const defaultedCall: Promise<void> = runNativeReviewCli();
const explicitCall: Promise<void> = runNativeReviewCli(['prepare', 'request.json', 'review task'], '/workspace');
const partialCall: Promise<void> = runNativeReviewCli(['validate']);
void [callable, defaultedCall, explicitCall, partialCall];
