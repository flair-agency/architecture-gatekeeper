import { validateJsonSchema, validateJsonSchemaDefinition } from '../../../src/json-schema.mjs';
import type { JsonSchemaValidationOptions, validateJsonSchema as TypedValidator } from '../../../src/authority-validation/json-schema.mts';

const known: { count: number } = { count: 2 };
const sameKnown: { count: number } = validateJsonSchema(known, { type: 'object' });
const unknownValue: unknown = validateJsonSchema({ count: 2 } as unknown, { type: 'string' });
const unknownSchema: unknown = {};
const inferredOnlyFromInput: number = validateJsonSchema(4, unknownSchema);
const sameDefinition: unknown = validateJsonSchemaDefinition(unknownSchema);
const defaultBudget: number = validateJsonSchema(5, {}, { maxOperations: null, maxDepth: undefined });
const explicitBudget: number = validateJsonSchema(5, {}, { maxOperations: 8, maxDepth: 12 });
const typedFacade: typeof validateJsonSchema = null as unknown as typeof TypedValidator;
const publicOptions: JsonSchemaValidationOptions = { maxOperations: null, maxDepth: 12 };
void [sameKnown, unknownValue, inferredOnlyFromInput, sameDefinition, defaultBudget, explicitBudget, typedFacade, publicOptions];
