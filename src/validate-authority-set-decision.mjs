#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateAuthoritySetDecision } from './authority-set.mjs';
import { validateMultiAuthorityDecision } from './multi-authority-provenance.mjs';

export function validatePreparedAuthorityDecision(decision, provenance) {
  if (provenance?.version === 2) return validateMultiAuthorityDecision(decision, provenance);
  if (!provenance || provenance.version !== 1 || !Array.isArray(provenance.members) ||
      !/^[a-f0-9]{64}$/.test(provenance.manifestSha256) || !/^[a-f0-9]{64}$/.test(provenance.setDigest)) {
    throw new Error('Authority Set provenance is invalid.');
  }
  return validateAuthoritySetDecision(decision, provenance);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: validate-authority-set-decision <provenance.json>');
    const provenanceBytes = readFileSync(process.argv[2]);
    const decisionBytes = readFileSync(0);
    const provenance = JSON.parse(provenanceBytes.toString('utf8'));
    const decision = JSON.parse(decisionBytes.toString('utf8'));
    validatePreparedAuthorityDecision(decision, provenance);
    // These input identities diagnose this validation call; they do not claim semantic PASS, schema completeness, or adoption.
    process.stdout.write(`${JSON.stringify({
      decision: { sha256: createHash('sha256').update(decisionBytes).digest('hex'), byteLength: decisionBytes.length },
      provenance: { sha256: createHash('sha256').update(provenanceBytes).digest('hex'), byteLength: provenanceBytes.length },
    })}\n`);
  } catch {
    process.stderr.write('Authority Set decision validation failed.\n');
    process.exitCode = 2;
  }
}
