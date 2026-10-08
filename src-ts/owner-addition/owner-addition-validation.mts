// Shared OWNER_ADDITION validators used by both the CI adapter and multi-authority flow.
const REQUIRED_CHECKS = [
  'eligible', 'onlyMissingDecision', 'preservesExistingRules',
  'noContradiction', 'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices',
  'matchesOrdinaryOwnerDecision',
] as const;
const DECISION_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;

type JsonObject = Record<string, unknown>;
type EligibilitySchema = JsonObject & { required: unknown[]; properties: JsonObject };
type EligibilityDecision = JsonObject & {
  summary: string;
  eligible: true;
  onlyMissingDecision: true;
  preservesExistingRules: true;
  noContradiction: true;
  noUnsupportedCompletionClaim: true;
  noUnrelatedUnresolvedChoices: true;
  matchesOrdinaryOwnerDecision: true;
};
type OrdinaryOwnerDecision = JsonObject & {
  decision: 'OWNER_DECISION';
  ownerDecisionId: string;
  summary: string;
};

export function validateOwnerAdditionEligibilitySchema(schema: unknown): asserts schema is EligibilitySchema {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
      (schema as JsonObject).type !== 'object' || (schema as JsonObject).additionalProperties !== false ||
      !Array.isArray((schema as JsonObject).required) ||
      !(schema as JsonObject).properties || typeof (schema as JsonObject).properties !== 'object' ||
      Array.isArray((schema as JsonObject).properties)) {
    throw new Error('Owner-addition schema must be a closed object.');
  }
  if (Object.keys(schema as JsonObject).some(key => !['$schema', 'type', 'additionalProperties', 'required', 'properties', 'description'].includes(key))) {
    throw new Error('Owner-addition schema uses an unsupported rule.');
  }
  const propertyKeys = Object.keys((schema as EligibilitySchema).properties);
  if (new Set((schema as EligibilitySchema).required).size !== (schema as EligibilitySchema).required.length ||
      propertyKeys.length !== (schema as EligibilitySchema).required.length ||
      propertyKeys.some(key => !(schema as EligibilitySchema).required.includes(key))) {
    throw new Error('Owner-addition schema must require every declared property.');
  }
  for (const key of REQUIRED_CHECKS) {
    if (!(schema as EligibilitySchema).required.includes(key) ||
        ((schema as EligibilitySchema).properties[key] as { type?: unknown } | null | undefined)?.type !== 'boolean') {
      throw new Error(`Owner-addition schema must require boolean ${key}.`);
    }
  }
  if (!(schema as EligibilitySchema).required.includes('summary') ||
      ((schema as EligibilitySchema).properties.summary as { type?: unknown } | null | undefined)?.type !== 'string') {
    throw new Error('Owner-addition schema must require a summary string.');
  }
  for (const [key, property] of Object.entries((schema as EligibilitySchema).properties)) {
    if (!property || typeof property !== 'object' || Array.isArray(property) ||
        Object.keys(property).some(name => !['type', 'description'].includes(name)) ||
        (key !== 'summary' && (property as { type?: unknown }).type !== 'boolean')) {
      throw new Error(`Owner-addition schema has an unsupported property: ${key}.`);
    }
  }
}

export function validateOwnerAdditionEligibility(rawDecision: string, schema: unknown): EligibilityDecision {
  validateOwnerAdditionEligibilitySchema(schema);
  let decision: unknown;
  try { decision = JSON.parse(rawDecision); } catch { throw new Error('Owner-addition reviewer returned invalid JSON.'); }
  if (!decision || typeof decision !== 'object' || Array.isArray(decision) ||
      typeof (decision as JsonObject).summary !== 'string' || !((decision as JsonObject).summary as string).trim() ||
      ((decision as JsonObject).summary as string).length > 4_000) {
    throw new Error('Owner-addition reviewer returned an incomplete decision.');
  }
  for (const key of REQUIRED_CHECKS) {
    if ((decision as JsonObject)[key] !== true) throw new Error(`Owner-addition reviewer did not establish ${key}.`);
  }
  const expected = Object.keys(schema.properties);
  if (Object.keys(decision as JsonObject).length !== expected.length || expected.some(key => !Object.hasOwn(decision as JsonObject, key))) {
    throw new Error('Owner-addition reviewer did not return the complete selected schema.');
  }
  for (const key of expected) {
    if (key !== 'summary' && (decision as JsonObject)[key] !== true) {
      throw new Error(`Owner-addition reviewer did not establish consumer check ${key}.`);
    }
  }
  // The schema and required-key loops above establish the static shape returned to typed callers.
  return decision as EligibilityDecision;
}

export function validateOrdinaryOwnerDecisionSchema(schema: unknown): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
      !Array.isArray((schema as JsonObject).required) ||
      !((schema as JsonObject).required as unknown[]).includes('ownerDecisionId') ||
      !(schema as JsonObject).properties ||
      ((schema as JsonObject).properties as {
        ownerDecisionId?: { type?: unknown } | null;
      }).ownerDecisionId?.type !== 'string') {
    throw new Error('Protected ordinary review schema must require ownerDecisionId.');
  }
}

export function validateOrdinaryOwnerDecision(rawDecision: string, missingDecisionId: string): OrdinaryOwnerDecision {
  let decision: unknown;
  try { decision = JSON.parse(rawDecision); } catch { throw new Error('Ordinary review did not return valid JSON.'); }
  if (!decision || (decision as JsonObject).decision !== 'OWNER_DECISION' ||
      !DECISION_ID.test((decision as JsonObject).ownerDecisionId as string) ||
      (decision as JsonObject).ownerDecisionId !== missingDecisionId ||
      typeof (decision as JsonObject).summary !== 'string' || !((decision as JsonObject).summary as string).trim() ||
      ((decision as JsonObject).gates && typeof (decision as JsonObject).gates === 'object' &&
        Object.values((decision as JsonObject).gates as object).some(gate =>
          (gate as { decision?: unknown } | null | undefined)?.decision === 'BLOCK'))) {
    throw new Error('Ordinary OWNER_DECISION does not identify the exact missing decision without a BLOCK.');
  }
  // The existing decision, ID-equality, and summary checks establish this shape when called with a string ID.
  return decision as OrdinaryOwnerDecision;
}
