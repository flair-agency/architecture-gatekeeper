import { validateAuthoritySetDecision } from '../authority-set.mjs';
import { validateMultiAuthorityDecision } from '../multi-authority-provenance.mjs';

/** Dispatch existing v1/v2 prepared decision validation without refining external JSON. */
export function validatePreparedAuthorityDecision(decision: unknown, provenance: unknown): unknown {
  if ((provenance as Record<string, unknown> | null | undefined)?.version === 2) return validateMultiAuthorityDecision(decision, provenance);
  if (!provenance || (provenance as Record<string, unknown>).version !== 1 || !Array.isArray((provenance as Record<string, unknown>).members) ||
      !/^[a-f0-9]{64}$/.test((provenance as Record<string, unknown>).manifestSha256 as string) || !/^[a-f0-9]{64}$/.test((provenance as Record<string, unknown>).setDigest as string)) {
    throw new Error('Authority Set provenance is invalid.');
  }
  return validateAuthoritySetDecision(decision, provenance);
}
