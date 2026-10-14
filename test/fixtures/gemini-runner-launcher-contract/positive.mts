import { formatGitHubReviewOutputs, parseArgs, runGeminiCiReview } from '../../../src/gemini-cli/ci-runner-entrypoint.mts';
import { buildIsolatedRunnerEnv, runIsolatedGeminiSession } from '../../../src/gemini-cli/launcher-entrypoint.mts';

const options: Record<string, string> = parseArgs(['--model', 'gemini-2.5-flash']);
const output: string = formatGitHubReviewOutputs({ decision: 'PASS' }, '/tmp/decision.json');
const review: Promise<unknown> = runGeminiCiReview();
const env: Record<string, string> = buildIsolatedRunnerEnv({ PATH: '/usr/bin', GEMINI_API_KEY: 'hidden' }, 'http://127.0.0.1', ['hidden']);
const session: Promise<number> = runIsolatedGeminiSession(['--model', 'gemini-2.5-flash'], { timeoutMs: 15 });
void [options, output, review, env, session];
