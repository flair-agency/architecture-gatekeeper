#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createReviewRequest, validateReviewResponse } from './review-contract.mjs';
function usage() { throw new Error('Usage: architecture-review-native prepare <request.json> <task...> | validate <request.json> <decision.json>'); }
export function runNativeReviewCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, requestPath, ...rest] = argv;
  if (command === 'prepare' && requestPath && rest.length) { const request = createReviewRequest(rest.join(' '), cwd); writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); process.stdout.write(`${JSON.stringify({ prompt: request.prompt, schema: request.schema, model: request.reviewer.model, reasoningEffort: request.reviewer.reasoningEffort, reviewTimeoutMs: request.reviewer.reviewTimeoutMs, requestPath }, null, 2)}\n`); return; }
  if (command === 'validate' && requestPath && rest.length === 1) { const request = JSON.parse(readFileSync(requestPath, 'utf8')); const decision = JSON.parse(readFileSync(rest[0], 'utf8')); process.stdout.write(`${JSON.stringify(validateReviewResponse(request, decision), null, 2)}\n`); return; }
  usage();
}
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) { try { runNativeReviewCli(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; } }
