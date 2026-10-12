#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDecisionRules } from './authority-validation/validate-decision.mts';
export { validateDecisionRules };

function fail(message) { throw new Error(message); }

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) fail('Usage: validate-decision <policy.json>');
  const policy = JSON.parse(readFileSync(argv[0], 'utf8'));
  validateDecisionRules(JSON.parse(readFileSync(0, 'utf8')), policy);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
