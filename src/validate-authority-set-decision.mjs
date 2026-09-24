#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateAuthoritySetDecision } from './authority-set.mjs';

export function validatePreparedAuthorityDecision(decision, provenance) {
  if (!provenance || provenance.version !== 1 || !Array.isArray(provenance.members) ||
      !/^[a-f0-9]{64}$/.test(provenance.manifestSha256) || !/^[a-f0-9]{64}$/.test(provenance.setDigest)) {
    throw new Error('Authority Set provenance is invalid.');
  }
  return validateAuthoritySetDecision(decision, provenance);
}

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
