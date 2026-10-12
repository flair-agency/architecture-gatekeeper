import { runNativeReviewCli } from '../../../src/native-review.mjs';

// CLI argument elements are strings.
runNativeReviewCli(['prepare', 1]);
// Working directory is a string when supplied.
runNativeReviewCli(['prepare'], 1);
// The CLI returns an asynchronous completion, not a synchronous result.
const synchronous: void = runNativeReviewCli();
void synchronous;
