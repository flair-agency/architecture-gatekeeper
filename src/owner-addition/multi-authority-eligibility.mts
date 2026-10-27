import { rejectDuplicateJsonKeys, validateAuthoritySetDecision } from '../authority-set.mts';
import { validateOwnerAdditionEligibility, validateOwnerAdditionEligibilitySchema } from '../owner-addition-validation.mts';
import { validateMultiAuthorityProvenance } from '../multi-authority-provenance.mts';

const SPECIAL = ['version', 'authorityIds', 'authoritySetDigest'];

type SchemaOperation = { required: unknown; properties: unknown; [key: string]: unknown };
type SchemaPropertiesOperation = { [key: string]: unknown };
type SchemaPropertyOperation = { type?: unknown; enum?: unknown; minItems?: unknown; items?: unknown };
type DecisionOperation = { version?: unknown; authoritySetDigest?: unknown; authorityIds?: unknown; [key: string]: unknown };
type ProvenanceOperation = { setDigest?: unknown };

function parse(source: unknown): unknown {
  rejectDuplicateJsonKeys(source, 'owner-addition input');
  return JSON.parse(source as string);
}

function legacySchema(schema: unknown): unknown {
  return { ...(schema as object), required: ((schema as SchemaOperation).required as unknown[]).filter(key => !SPECIAL.includes(key as string)),
    properties: Object.fromEntries(Object.entries((schema as SchemaOperation).properties as object).filter(([key]) => !SPECIAL.includes(key))) };
}

export function validateMultiAuthorityEligibilitySchema(schema: unknown): void {
  if (!schema || !Array.isArray((schema as SchemaOperation).required) || !(schema as SchemaOperation).properties ||
      SPECIAL.some(key => !((schema as SchemaOperation).required as unknown[]).includes(key)) ||
      (((schema as SchemaOperation).properties as SchemaPropertiesOperation).version as SchemaPropertyOperation | null | undefined)?.type !== 'integer' ||
      JSON.stringify((((schema as SchemaOperation).properties as SchemaPropertiesOperation).version as SchemaPropertyOperation).enum) !== '[2]' ||
      (((schema as SchemaOperation).properties as SchemaPropertiesOperation).authoritySetDigest as SchemaPropertyOperation | null | undefined)?.type !== 'string' ||
      (((schema as SchemaOperation).properties as SchemaPropertiesOperation).authorityIds as SchemaPropertyOperation | null | undefined)?.type !== 'array' ||
      (((schema as SchemaOperation).properties as SchemaPropertiesOperation).authorityIds as SchemaPropertyOperation).minItems !== 1 ||
      ((((schema as SchemaOperation).properties as SchemaPropertiesOperation).authorityIds as SchemaPropertyOperation).items as SchemaPropertyOperation | null | undefined)?.type !== 'string') {
    throw new Error('Multi-document eligibility schema must require version 2, authorityIds and authoritySetDigest.');
  }
  // Keep the v1 closed-schema restrictions and consumer boolean requirements.
  for (const [key, allowed] of ([['version', ['type', 'enum', 'description']],
    ['authoritySetDigest', ['type', 'description']], ['authorityIds', ['type', 'minItems', 'items', 'description']]] as [string, string[]][])) {
    if (Object.keys(((schema as SchemaOperation).properties as SchemaPropertiesOperation)[key] as object).some(name => !allowed.includes(name))) throw new Error('Unsupported multi-document eligibility schema rule.');
  }
  if (Object.keys(((((schema as SchemaOperation).properties as SchemaPropertiesOperation).authorityIds as SchemaPropertyOperation).items) as object).some(key => !['type', 'description'].includes(key)) ||
      new Set((schema as SchemaOperation).required as unknown[]).size !== ((schema as SchemaOperation).required as { length: unknown }).length) throw new Error('Invalid multi-document eligibility schema.');
  validateOwnerAdditionEligibilitySchema(legacySchema(schema));
}

export function validateMultiAuthorityEligibility(raw: unknown, schema: unknown, provenance: unknown): unknown {
  validateMultiAuthorityEligibilitySchema(schema);
  validateMultiAuthorityProvenance(provenance);
  const decision = parse(raw);
  if (!decision || (decision as DecisionOperation).version !== 2 || (decision as DecisionOperation).authoritySetDigest !== (provenance as ProvenanceOperation).setDigest) {
    throw new Error('Multi-document eligibility version or Authority Set binding differs.');
  }
  validateAuthoritySetDecision({ decision: 'PASS', authorityIds: (decision as DecisionOperation).authorityIds }, provenance);
  const core = Object.fromEntries(Object.entries(decision as object).filter(([key]) => !SPECIAL.includes(key)));
  validateOwnerAdditionEligibility(JSON.stringify(core) as string, legacySchema(schema));
  return decision;
}
