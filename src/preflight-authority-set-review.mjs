#!/usr/bin/env node
import { readFileSync, statSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeLimits } from './prepare-authority-set.mjs';

/** A selected route needs a protected output schema that can report source IDs. */
export function validateAuthorityReviewSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
      schema.type !== 'object' || !Array.isArray(schema.required) ||
      !schema.required.includes('authorityIds') ||
      !schema.properties || typeof schema.properties !== 'object' ||
      Array.isArray(schema.properties)) throw new Error('Protected decision schema must require authorityIds.');
  const ids = schema.properties.authorityIds;
  if (!ids || ids.type !== 'array' || ids.items?.type !== 'string' ||
      !Number.isSafeInteger(ids.minItems) || ids.minItems < 1) {
    throw new Error('Protected decision schema must define authorityIds as a nonempty string array.');
  }
  return schema;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [schemaPath, promptPath] = process.argv.slice(2);
    if (!schemaPath || !promptPath || process.argv.length !== 4) throw new Error('Usage: preflight-authority-set-review <schema> <complete-prompt>');
    const limits = decodeLimits(process.env.AUTHORITY_LIMITS_BASE64);
    validateAuthorityReviewSchema(JSON.parse(readFileSync(schemaPath, 'utf8')));
    const prompt = statSync(promptPath);
    if (!prompt.isFile() || prompt.size > limits.maxPromptBytes) throw new Error('Complete review prompt exceeds the protected byte limit.');
  } catch {
    process.stderr.write('Authority Set review preflight failed.\n');
    process.exitCode = 2;
  }
}
