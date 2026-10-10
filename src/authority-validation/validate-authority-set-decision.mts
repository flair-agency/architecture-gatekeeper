import { validateAuthoritySetDecision } from '../authority-set.mjs';
import { validateMultiAuthorityDecision } from '../multi-authority-provenance.mjs';

/** Dispatch existing v1/v2 prepared decision validation without refining external JSON. */
export function validatePreparedAuthorityDecision(decision: unknown, provenance: unknown): unknown {
  const candidate = provenance as Record<string, unknown> | null | undefined;
  if (candidate?.version === 2) return validateMultiAuthorityDecision(decision, provenance);
  if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.members) ||
      !/^[a-f0-9]{64}$/.test(candidate.manifestSha256 as string) || !/^[a-f0-9]{64}$/.test(candidate.setDigest as string)) {
    throw new Error('Authority Set provenance is invalid.');
  }
  return validateAuthoritySetDecision(decision, provenance);
}
