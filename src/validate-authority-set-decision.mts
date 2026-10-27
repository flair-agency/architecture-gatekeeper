#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validatePreparedAuthorityDecision } from './authority-validation/validate-authority-set-decision.mts';
export { validatePreparedAuthorityDecision };

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: validate-authority-set-decision <provenance.json>');
    const provenance = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const decision = JSON.parse(readFileSync(0, 'utf8'));
    validatePreparedAuthorityDecision(decision, provenance);
  } catch {
    process.stderr.write('Authority Set decision validation failed.\n');
    process.exitCode = 2;
  }
}
