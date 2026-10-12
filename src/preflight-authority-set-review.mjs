#!/usr/bin/env node
import { readFileSync, statSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeLimits } from './prepare-authority-set.mjs';
import { validateAuthorityReviewSchema } from './authority-validation/preflight-authority-set-review.mts';
export { validateAuthorityReviewSchema };

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [schemaPath, promptPath] = process.argv.slice(2);
    if (!schemaPath || !promptPath || process.argv.length !== 4) throw new Error('Usage: preflight-authority-set-review <schema> <complete-prompt>');
    const profile = process.env.AUTHORITY_PROFILE || 'v1';
    const limits = decodeLimits(process.env.AUTHORITY_LIMITS_BASE64, profile);
    validateAuthorityReviewSchema(JSON.parse(readFileSync(schemaPath, 'utf8')), profile);
    const prompt = statSync(promptPath);
    if (!prompt.isFile() || prompt.size > limits.maxPromptBytes) throw new Error('Complete review prompt exceeds the protected byte limit.');
  } catch {
    process.stderr.write('Authority Set review preflight failed.\n');
    process.exitCode = 2;
  }
}
