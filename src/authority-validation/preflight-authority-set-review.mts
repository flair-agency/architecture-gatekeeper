import { MULTI_AUTHORITY_PROFILE } from '../authority-set.mjs';

/** Validate the existing protected output schema checks and return the same schema. */
export function validateAuthorityReviewSchema<TSchema>(schema: TSchema, profile: unknown = 'v1'): TSchema {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
      (schema as Record<string, unknown>).type !== 'object' || !Array.isArray((schema as Record<string, unknown>).required) ||
      !(schema as { required: string[] }).required.includes('authorityIds') ||
      !(schema as Record<string, unknown>).properties || typeof (schema as Record<string, unknown>).properties !== 'object' ||
      Array.isArray((schema as Record<string, unknown>).properties)) throw new Error('Protected decision schema must require authorityIds.');
  const ids = ((schema as { properties: Record<string, unknown> }).properties.authorityIds) as Record<string, unknown> | null | undefined;
  if (!ids || ids.type !== 'array' || (ids.items as Record<string, unknown> | null | undefined)?.type !== 'string' ||
      !Number.isSafeInteger(ids.minItems) || (ids.minItems as number) < 1) {
    throw new Error('Protected decision schema must define authorityIds as a nonempty string array.');
  }
  if (profile === MULTI_AUTHORITY_PROFILE &&
      (!(schema as { required: string[] }).required.includes('authoritySetDigest') || (((schema as { properties: Record<string, unknown> }).properties.authoritySetDigest) as Record<string, unknown> | null | undefined)?.type !== 'string' ||
       !(schema as { required: string[] }).required.includes('ownerDecisionId') || (((schema as { properties: Record<string, unknown> }).properties.ownerDecisionId) as Record<string, unknown> | null | undefined)?.type !== 'string')) {
    throw new Error('Multi-document review schema must require authoritySetDigest and ownerDecisionId.');
  }
  return schema;
}
