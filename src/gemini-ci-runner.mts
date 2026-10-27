#!/usr/bin/env node
/**
 * src/gemini-ci-runner.mjs
 * Flat compatibility facade for the typed Gemini CI runner.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  formatGitHubReviewOutputs,
  parseArgs,
  resolveReviewRequest,
  resolveSafePath,
  runGeminiCiReview,
  runGeminiCiReviewCli,
} from './gemini-cli/ci-runner-entrypoint.mts';

export {
  formatGitHubReviewOutputs,
  parseArgs,
  resolveReviewRequest,
  resolveSafePath,
  runGeminiCiReview,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  runGeminiCiReviewCli();
}
