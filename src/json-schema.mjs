function fail(message) { throw new Error(`Decision schema validation failed: ${message}`); }
function kind(value) { if (value === null) return 'null'; if (Array.isArray(value)) return 'array'; if (Number.isInteger(value)) return 'integer'; return typeof value; }
function validateNode(value, schema, path) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) fail(`${path} has an invalid schema.`);
  const supported = new Set(['$schema', 'type', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'minLength', 'minimum', 'maximum']);
  for (const key of Object.keys(schema)) if (!supported.has(key)) fail(`${path} uses unsupported keyword ${key}.`);
  if (schema.enum && (!Array.isArray(schema.enum) || !schema.enum.some(item => Object.is(item, value)))) fail(`${path} is outside its enum.`);
  if (schema.type) {
    const actual = kind(value);
    if (!(schema.type === actual || (schema.type === 'number' && ['integer', 'number'].includes(actual)))) fail(`${path} must be ${schema.type}.`);
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) fail(`${path} is too short.`);
  if (typeof value === 'number') { if (schema.minimum !== undefined && value < schema.minimum) fail(`${path} is below minimum.`); if (schema.maximum !== undefined && value > schema.maximum) fail(`${path} is above maximum.`); }
  if (Array.isArray(value)) { if (schema.minItems !== undefined && value.length < schema.minItems) fail(`${path} has too few items.`); if (schema.items) value.forEach((item, index) => validateNode(item, schema.items, `${path}/${index}`)); }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    if (schema.required) { if (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string')) fail(`${path} has invalid required fields.`); for (const key of schema.required) if (!Object.hasOwn(value, key)) fail(`${path}/${key} is required.`); }
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) fail(`${path}/${key} is not allowed.`);
    for (const [key, child] of Object.entries(properties)) if (Object.hasOwn(value, key)) validateNode(value[key], child, `${path}/${key}`);
  }
}
export function validateJsonSchema(value, schema) { validateNode(value, schema, '$'); return value; }
