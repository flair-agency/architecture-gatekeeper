#!/usr/bin/env node
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare as prepare, sha256, resolveSingleOwnerAdditionAuthorityId } from './owner-addition/owner-addition-ci.mts';
import { validateMultiAuthorityEligibility } from './owner-addition-multiauthority.mjs';
import { validateOwnerAdditionEligibility, validateOwnerAdditionEligibilitySchema,
  validateOrdinaryOwnerDecision, validateOrdinaryOwnerDecisionSchema } from './owner-addition/owner-addition-validation.mts';
export { resolveSingleOwnerAdditionAuthorityId } from './owner-addition/owner-addition-ci.mts';
export { validateOwnerAdditionEligibility, validateOwnerAdditionEligibilitySchema,
  validateOrdinaryOwnerDecision, validateOrdinaryOwnerDecisionSchema } from './owner-addition/owner-addition-validation.mts';

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'prepare') await prepare(/** @type {import('./owner-addition/owner-addition-ci.mts').OwnerAdditionCiEnvironment} */ (process.env));
  else if (process.argv[2] === 'validate') {
    const schemaPath = join(process.env.OUTPUT_DIR || '', 'eligibility.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    if (schema.properties?.version?.type === 'integer') {
      const procedure = JSON.parse(readFileSync(join(process.env.OUTPUT_DIR || '', 'procedure.json'), 'utf8'));
      if (procedure.version !== 2) throw new Error('Multi-document eligibility requires a version 2 procedure.');
      validateMultiAuthorityEligibility(process.env.DECISION || '', schema, procedure.authoritySet);
    } else validateOwnerAdditionEligibility(process.env.DECISION || '', schema);
    const contextPath = join(process.env.OUTPUT_DIR || '', 'evidence-context.json');
    if (process.env.POLICY_VERSION === '5') {
      const context = JSON.parse(readFileSync(contextPath, 'utf8'));
      if (context.policyVersion !== 5 || context.version !== 1) throw new Error('Procedural evidence context version differs.');
      const procedure = readFileSync(join(process.env.OUTPUT_DIR || '', 'procedure.json'));
      const ordinaryDecision = Buffer.from(context.ordinaryDecisionBase64, 'base64');
      const eligibilityDecision = Buffer.from(process.env.DECISION || '', 'utf8');
      const authoritySetProvenance = Buffer.from(context.authoritySetProvenanceBase64, 'base64');
      const runId = Number(process.env.GITHUB_RUN_ID);
      const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
      if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
          !ordinaryDecision.length || !eligibilityDecision.length || !authoritySetProvenance.length) {
        throw new Error('Procedural eligibility evidence is incomplete.');
      }
      writeFileSync(join(process.env.OUTPUT_DIR, 'eligibility-evidence.json'), JSON.stringify({
        version: 1, repository: context.repository, targetBranch: context.targetBranch,
        prNumber: context.prNumber, baseSha: context.baseSha, headSha: context.headSha,
        runId, runAttempt,
        procedureBase64: procedure.toString('base64'),
        ordinaryDecisionBase64: ordinaryDecision.toString('base64'),
        eligibilityDecisionBase64: eligibilityDecision.toString('base64'),
        authoritySetProvenanceBase64: authoritySetProvenance.toString('base64'),
        digests: { procedure: sha256(procedure), ordinaryDecision: sha256(ordinaryDecision),
          eligibilityDecision: sha256(eligibilityDecision), authoritySetProvenance: sha256(authoritySetProvenance) },
      }), { mode: 0o600 });
    }
    if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, 'eligibility=ELIGIBLE\n', { flag: 'a' });
  } else throw new Error('Usage: owner-addition-ci.mjs prepare|validate');
}
