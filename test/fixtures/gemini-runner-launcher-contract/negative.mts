import { parseArgs, runGeminiCiReview } from '../../../src/gemini-cli/ci-runner-entrypoint.mts';
import { buildIsolatedRunnerEnv, runIsolatedGeminiSession } from '../../../src/gemini-cli/launcher-entrypoint.mts';

parseArgs([1]);
runGeminiCiReview(42);
const completion: Promise<string> = runGeminiCiReview();
buildIsolatedRunnerEnv({}, 42);
runIsolatedGeminiSession([1]);
// @ts-expect-error The proxy reserves dispatch synchronously before sending.
runIsolatedGeminiSession([], { proxyConfigOverride: { reserveDispatch: async () => true } });
void completion;
