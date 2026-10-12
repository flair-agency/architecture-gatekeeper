import { runNativeReviewCli } from '../../../src/native-review.mjs';

// @ts-expect-error CLI argument elements are strings.
runNativeReviewCli(['prepare', 1]);
// @ts-expect-error Working directory is a string when supplied.
runNativeReviewCli(['prepare'], 1);
// @ts-expect-error The CLI returns an asynchronous completion, not a synchronous result.
const synchronous: void = runNativeReviewCli();
void synchronous;
