#!/usr/bin/env node
/**
 * scripts/gemini-review.mjs
 * Standalone manual architecture reviewer powered by Gemini API.
 * Uses repository-owned authority, prompts, schemas, and deterministic validation.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createReviewRequestAsync, validateReviewResponse } from '../src/review-contract.mjs';
import { runGeminiReviewer } from '../src/gemini-transport.mjs';

export async function runGeminiReviewCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  let task = argv.join(' ').trim();
  if (!task) {
    try {
      task = readFileSync(0, 'utf8').trim();
    } catch {
      // stdin was empty or unreadable
    }
  }
  if (!task) {
    throw new Error('Usage: node scripts/gemini-review.mjs <task...> or supply task via stdin');
  }

  const request = await createReviewRequestAsync(task, cwd);
  const decision = await runGeminiReviewer(request);
  const validated = validateReviewResponse(request, decision);

  process.stdout.write(`${JSON.stringify(validated, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  runGeminiReviewCli().catch(error => {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
