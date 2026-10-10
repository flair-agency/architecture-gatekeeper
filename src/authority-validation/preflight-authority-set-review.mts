import { MULTI_AUTHORITY_PROFILE } from '../authority-set.mjs';

/** Validate the existing protected output schema checks and return the same schema. */
export function validateAuthorityReviewSchema<TSchema>(schema: TSchema, profile: unknown = 'v1'): TSchema {
  const value = schema as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.type !== 'object' || !Array.isArray(value.required) ||
      !value.required.includes('authorityIds') ||
      !value.properties || typeof value.properties !== 'object' ||
      Array.isArray(value.properties)) throw new Error('Protected decision schema must require authorityIds.');
  const properties = value.properties as Record<string, unknown>;
  const ids = properties.authorityIds as Record<string, unknown> | null | undefined;
  const items = ids?.items as Record<string, unknown> | null | undefined;
  if (!ids || ids.type !== 'array' || items?.type !== 'string' ||
      !Number.isSafeInteger(ids.minItems) || (ids.minItems as number) < 1) {
    throw new Error('Protected decision schema must define authorityIds as a nonempty string array.');
  }
  if (profile === MULTI_AUTHORITY_PROFILE &&
      (!value.required.includes('authoritySetDigest') || (properties.authoritySetDigest as Record<string, unknown> | null | undefined)?.type !== 'string' ||
       !value.required.includes('ownerDecisionId') || (properties.ownerDecisionId as Record<string, unknown> | null | undefined)?.type !== 'string')) {
    throw new Error('Multi-document review schema must require authoritySetDigest and ownerDecisionId.');
  }
  return schema;
}
