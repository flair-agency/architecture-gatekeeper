import { runNativeReviewCli } from '../../../src/native-review.mjs';
import { runNativeReviewCli as groupedCli } from '../../../src/local-review/native-review.mts';

const callable: (argv?: string[], cwd?: string) => Promise<void> = runNativeReviewCli;
const defaultedCall: Promise<void> = runNativeReviewCli();
const explicitCall: Promise<void> = runNativeReviewCli(['prepare', 'request.json', 'review task'], '/workspace');
const partialCall: Promise<void> = runNativeReviewCli(['validate']);
const groupedCallable: typeof callable = groupedCli;
const groupedCall: Promise<void> = groupedCli(['validate']);
void [callable, defaultedCall, explicitCall, partialCall, groupedCallable, groupedCall];
