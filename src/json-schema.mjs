const SUPPORTED = new Set(['$schema', '$defs', '$ref', 'description', 'anyOf', 'type', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'minLength', 'minimum', 'maximum']);
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
function fail(message) { throw new Error(`Decision schema validation failed: ${message}`); }
function owns(value, key) { return Object.hasOwn(value, key); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function kind(value) { if (value === null) return 'null'; if (Array.isArray(value)) return 'array'; if (Number.isInteger(value)) return 'integer'; return typeof value; }
function pointerPart(part) { if (/~(?![01])/u.test(part)) fail('a local $ref has an invalid JSON Pointer escape.'); return part.replaceAll('~1', '/').replaceAll('~0', '~'); }
function resolveRef(root, ref) {
  if (ref === '#') return root;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) fail('$ref must be a local JSON Pointer.');
  let value = root;
  for (const raw of ref.slice(2).split('/')) { const key = pointerPart(raw); if (!object(value) || !owns(value, key)) fail(`$ref cannot resolve ${ref}.`); value = value[key]; }
  if (!object(value)) fail(`$ref ${ref} does not identify a schema object.`);
  return value;
}
function validateTypeDefinition(type, path) {
  const values = Array.isArray(type) ? type : [type];
  if (!values.length || values.some(value => typeof value !== 'string' || !TYPES.has(value)) || new Set(values).size !== values.length) fail(`${path}/type is malformed.`);
}
function validateDefinition(schema, root, path, activeRefs = new Set()) {
  if (!object(schema)) fail(`${path} has an invalid schema.`);
  for (const key of Object.keys(schema)) if (!SUPPORTED.has(key)) fail(`${path} uses unsupported keyword ${key}.`);
  if (owns(schema, '$schema') && typeof schema.$schema !== 'string') fail(`${path}/$schema must be a string.`);
  if (owns(schema, 'description') && typeof schema.description !== 'string') fail(`${path}/description must be a string.`);
  if (owns(schema, 'type')) validateTypeDefinition(schema.type, path);
  if (owns(schema, 'enum') && (!Array.isArray(schema.enum) || !schema.enum.length)) fail(`${path}/enum must be a nonempty array.`);
  if (owns(schema, 'required') && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string') || new Set(schema.required).size !== schema.required.length)) fail(`${path}/required is malformed.`);
  if (owns(schema, 'additionalProperties') && typeof schema.additionalProperties !== 'boolean') fail(`${path}/additionalProperties must be boolean.`);
  if (owns(schema, 'minItems') && (!Number.isInteger(schema.minItems) || schema.minItems < 0)) fail(`${path}/minItems must be a nonnegative integer.`);
  if (owns(schema, 'minLength') && (!Number.isInteger(schema.minLength) || schema.minLength < 0)) fail(`${path}/minLength must be a nonnegative integer.`);
  for (const key of ['minimum', 'maximum']) if (owns(schema, key) && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]))) fail(`${path}/${key} must be a finite number.`);
  if (owns(schema, '$defs')) { if (!object(schema.$defs)) fail(`${path}/$defs must be an object.`); for (const [key, child] of Object.entries(schema.$defs)) validateDefinition(child, root, `${path}/$defs/${key}`, activeRefs); }
  if (owns(schema, 'properties')) { if (!object(schema.properties)) fail(`${path}/properties must be an object.`); for (const [key, child] of Object.entries(schema.properties)) validateDefinition(child, root, `${path}/properties/${key}`, activeRefs); }
  if (owns(schema, 'items')) validateDefinition(schema.items, root, `${path}/items`, activeRefs);
  if (owns(schema, 'anyOf')) { if (!Array.isArray(schema.anyOf) || !schema.anyOf.length) fail(`${path}/anyOf must be a nonempty array.`); schema.anyOf.forEach((child, index) => validateDefinition(child, root, `${path}/anyOf/${index}`, activeRefs)); }
  if (owns(schema, '$ref')) {
    const target = resolveRef(root, schema.$ref);
    if (!activeRefs.has(schema.$ref)) { const next = new Set(activeRefs).add(schema.$ref); validateDefinition(target, root, schema.$ref, next); }
  }
}
function typeMatches(value, expected) { const actual = kind(value); return expected === actual || (expected === 'number' && ['integer', 'number'].includes(actual)); }
function validateNode(value, schema, root, path) {
  if (owns(schema, '$ref')) validateNode(value, resolveRef(root, schema.$ref), root, path);
  if (owns(schema, 'anyOf')) {
    let matches = 0;
    for (const child of schema.anyOf) { try { validateNode(value, child, root, path); matches += 1; } catch {} }
    if (!matches) fail(`${path} does not match any anyOf branch.`);
  }
  if (owns(schema, 'enum') && !schema.enum.some(item => Object.is(item, value))) fail(`${path} is outside its enum.`);
  if (owns(schema, 'type')) { const expected = Array.isArray(schema.type) ? schema.type : [schema.type]; if (!expected.some(type => typeMatches(value, type))) fail(`${path} must match type ${expected.join(' or ')}.`); }
  if (typeof value === 'string' && owns(schema, 'minLength') && value.length < schema.minLength) fail(`${path} is too short.`);
  if (typeof value === 'number') { if (owns(schema, 'minimum') && value < schema.minimum) fail(`${path} is below minimum.`); if (owns(schema, 'maximum') && value > schema.maximum) fail(`${path} is above maximum.`); }
  if (Array.isArray(value)) { if (owns(schema, 'minItems') && value.length < schema.minItems) fail(`${path} has too few items.`); if (owns(schema, 'items')) value.forEach((item, index) => validateNode(item, schema.items, root, `${path}/${index}`)); }
  if (object(value)) {
    const properties = owns(schema, 'properties') ? schema.properties : {};
    if (owns(schema, 'required')) for (const key of schema.required) if (!owns(value, key)) fail(`${path}/${key} is required.`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!owns(properties, key)) fail(`${path}/${key} is not allowed.`);
    for (const [key, child] of Object.entries(properties)) if (owns(value, key)) validateNode(value[key], child, root, `${path}/${key}`);
  }
}
export function validateJsonSchema(value, schema) { validateDefinition(schema, schema, '$'); validateNode(value, schema, schema, '$'); return value; }
