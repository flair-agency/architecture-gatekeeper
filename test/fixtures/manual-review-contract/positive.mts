import '../../../src/local-review/manual-review.mts';
import { runManualReviewCli } from '../../../src/local-review/local-gate.mts';
import { runManualReviewCli as flatHookCli } from '../../../src/local-gate.mjs';

const defaultCli: void = runManualReviewCli();
const readOnlyArguments: readonly string[] = ['Review this task'];
const explicitCli: void = runManualReviewCli(readOnlyArguments);
const flatFacade: void = flatHookCli(['Review this task']);
void [defaultCli, explicitCli, flatFacade];
