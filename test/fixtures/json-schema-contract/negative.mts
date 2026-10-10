import { validateJsonSchema, validateJsonSchemaDefinition } from '../../../src/json-schema.mjs';

const wrongBudget = validateJsonSchema('value', {}, { maxOperations: '8' });
const wrongDepth = validateJsonSchema('value', {}, { maxDepth: false });
const inferredFromSchema: number = validateJsonSchema({ count: 1 } as unknown, { type: 'number' });
const definitionClaim: { valid: true } = validateJsonSchemaDefinition({ type: 'object' });
void [wrongBudget, wrongDepth, inferredFromSchema, definitionClaim];
