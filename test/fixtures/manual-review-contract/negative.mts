import { runManualReviewCli } from '../../../src/local-review/local-gate.mts';
// CLI argv must be a list of argument strings.
runManualReviewCli(42);
// CLI argv elements must be strings.
runManualReviewCli(['review', 42]);
