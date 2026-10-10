#!/usr/bin/env node
import { isAbsolute, join } from 'node:path';
import { realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareReviewContext } from './review-inputs/prepare-review-context.mts';

export { prepareReviewContext };

function fail(message) { throw new Error(`Review task context: ${message}`); }

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const runnerTemp = process.env.RUNNER_TEMP;
    const authorityRouteSelected = process.env.AUTHORITY_ROUTE_SELECTED;
    const policyVersion = process.env.POLICY_VERSION;
    if (!runnerTemp || !isAbsolute(runnerTemp)) fail('runner temporary directory is missing or invalid.');
    const promptName = policyVersion === '1' ? 'architecture-gate-legacy-prompt.md' :
      authorityRouteSelected === 'true' ? 'architecture-gate-complete-prompt.md' : null;
    if (!promptName || (policyVersion === '1' && authorityRouteSelected === 'true')) {
      fail('protected review route cannot select a prompt file.');
    }
    const result = prepareReviewContext({ root: process.env.GITHUB_WORKSPACE,
      baseSha: process.env.BASE_SHA, headSha: process.env.HEAD_SHA, reviewedSha: process.env.REVIEWED_SHA,
      repository: process.env.GITHUB_REPOSITORY, promptPath: join(runnerTemp, promptName),
      outputPath: join(runnerTemp, 'architecture-gate-review-prompt.md'), authorityRouteSelected,
      authorityLimitsBase64: process.env.AUTHORITY_LIMITS_BASE64, authorityProfile: process.env.AUTHORITY_PROFILE,
      policyVersion });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
