import { runManualReviewCli } from '../../../src/local-review/local-gate.mts';
// @ts-expect-error CLI argv must be a list of argument strings.
runManualReviewCli(42);
// @ts-expect-error CLI argv elements must be strings.
runManualReviewCli(['review', 42]);
