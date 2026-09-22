const SUPPORTED = new Set(['$schema', '$defs', '$ref', 'description', 'anyOf', 'type', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'minLength', 'minimum', 'maximum']);
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const DEFAULT_MAX_OPERATIONS = 100000;
const DEFAULT_MAX_DEPTH = 256;
class ValidationFailure extends Error { constructor(message, fatal = false) { super(`Decision schema validation failed: ${message}`); this.fatal = fatal; } }
function fail(message, fatal = false) { throw new ValidationFailure(message, fatal); }
function owns(value, key) { return Object.hasOwn(value, key); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function kind(value) { if (value === null) return 'null'; if (Array.isArray(value)) return 'array'; if (Number.isInteger(value)) return 'integer'; return typeof value; }
function pointerPart(part) { if (/~(?![01])/u.test(part)) fail('a local $ref has an invalid JSON Pointer escape.'); return part.replaceAll('~1', '/').replaceAll('~0', '~'); }
function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) fail('$ref must be a local URI fragment JSON Pointer.');
  let pointer;
  try { pointer = decodeURIComponent(ref.slice(1)); } catch { fail('$ref has malformed percent encoding.'); }
  if (pointer === '') return root;
  if (!pointer.startsWith('/')) fail('$ref must be a local URI fragment JSON Pointer.');
  let value = root;
  for (const raw of pointer.slice(1).split('/')) { const key = pointerPart(raw); if (!object(value) || !owns(value, key)) fail(`$ref cannot resolve ${ref}.`); value = value[key]; }
  if (!object(value)) fail(`$ref ${ref} does not identify a schema object.`);
  return value;
}
function validateTypeDefinition(type, path) {
  const values = Array.isArray(type) ? type : [type];
  if (!values.length || values.some(value => typeof value !== 'string' || !TYPES.has(value)) || new Set(values).size !== values.length) fail(`${path}/type is malformed.`);
}
function validateDefinition(schema, root, path, activeSchemas = new Set()) {
  if (!object(schema)) fail(`${path} has an invalid schema.`);
  if (activeSchemas.has(schema)) return;
  const next = new Set(activeSchemas).add(schema);
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
  if (owns(schema, '$defs')) { if (!object(schema.$defs)) fail(`${path}/$defs must be an object.`); for (const [key, child] of Object.entries(schema.$defs)) validateDefinition(child, root, `${path}/$defs/${key}`, next); }
  if (owns(schema, 'properties')) { if (!object(schema.properties)) fail(`${path}/properties must be an object.`); for (const [key, child] of Object.entries(schema.properties)) validateDefinition(child, root, `${path}/properties/${key}`, next); }
  if (owns(schema, 'items')) validateDefinition(schema.items, root, `${path}/items`, next);
  if (owns(schema, 'anyOf')) { if (!Array.isArray(schema.anyOf) || !schema.anyOf.length) fail(`${path}/anyOf must be a nonempty array.`); schema.anyOf.forEach((child, index) => validateDefinition(child, root, `${path}/anyOf/${index}`, next)); }
  if (owns(schema, '$ref')) validateDefinition(resolveRef(root, schema.$ref), root, schema.$ref, next);
}
function typeMatches(value, expected) { const actual = kind(value); return expected === actual || (expected === 'number' && ['integer', 'number'].includes(actual)); }
function primitiveKey(value) { if (value === null) return 'null'; if (typeof value === 'number') return `number:${Object.is(value, -0) ? '-0' : String(value)}`; return `${typeof value}:${String(value)}`; }
function identity(map, value, nextId) { if (!map.has(value)) map.set(value, nextId()); return map.get(value); }
function pairKey(context, schema, value) {
  const schemaId = identity(context.schemaIds, schema, () => ++context.lastSchemaId);
  const valueId = value !== null && typeof value === 'object' ? `object:${identity(context.instanceIds, value, () => ++context.lastInstanceId)}` : primitiveKey(value);
  return `${schemaId}|${valueId}`;
}
function validateNode(value, schema, root, path, context, depth) {
  context.operations += 1;
  if (context.operations > context.maxOperations) fail(`validation operation budget exceeded (${context.maxOperations}).`, true);
  if (depth > context.maxDepth) fail(`validation depth budget exceeded (${context.maxDepth}).`, true);
  const key = pairKey(context, schema, value); const prior = context.memo.get(key);
  if (prior?.state === 'pass') return;
  if (prior?.state === 'fail') throw new ValidationFailure(prior.message);
  if (prior?.state === 'active') fail('recursive schema evaluation repeated without instance progress.', true);
  context.memo.set(key, { state: 'active' });
  try { validateNodeUncached(value, schema, root, path, context, depth); context.memo.set(key, { state: 'pass' }); }
  catch (error) { if (!error.fatal) context.memo.set(key, { state: 'fail', message: error.message.replace(/^Decision schema validation failed: /, '') }); else context.memo.delete(key); throw error; }
}
function validateNodeUncached(value, schema, root, path, context, depth) {
  if (owns(schema, '$ref')) validateNode(value, resolveRef(root, schema.$ref), root, path, context, depth + 1);
  if (owns(schema, 'anyOf')) {
    let matches = 0;
    for (const child of schema.anyOf) { try { validateNode(value, child, root, path, context, depth + 1); matches += 1; } catch (error) { if (error.fatal) throw error; } }
    if (!matches) fail(`${path} does not match any anyOf branch.`);
  }
  if (owns(schema, 'enum') && !schema.enum.some(item => Object.is(item, value))) fail(`${path} is outside its enum.`);
  if (owns(schema, 'type')) { const expected = Array.isArray(schema.type) ? schema.type : [schema.type]; if (!expected.some(type => typeMatches(value, type))) fail(`${path} must match type ${expected.join(' or ')}.`); }
  if (typeof value === 'string' && owns(schema, 'minLength') && value.length < schema.minLength) fail(`${path} is too short.`);
  if (typeof value === 'number') { if (owns(schema, 'minimum') && value < schema.minimum) fail(`${path} is below minimum.`); if (owns(schema, 'maximum') && value > schema.maximum) fail(`${path} is above maximum.`); }
  if (Array.isArray(value)) { if (owns(schema, 'minItems') && value.length < schema.minItems) fail(`${path} has too few items.`); if (owns(schema, 'items')) value.forEach((item, index) => validateNode(item, schema.items, root, `${path}/${index}`, context, depth + 1)); }
  if (object(value)) {
    const properties = owns(schema, 'properties') ? schema.properties : {};
    if (owns(schema, 'required')) for (const key of schema.required) if (!owns(value, key)) fail(`${path}/${key} is required.`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!owns(properties, key)) fail(`${path}/${key} is not allowed.`);
    for (const [key, child] of Object.entries(properties)) if (owns(value, key)) validateNode(value[key], child, root, `${path}/${key}`, context, depth + 1);
  }
}
export function validateJsonSchema(value, schema, options = {}) {
  const maxOperations = options.maxOperations ?? DEFAULT_MAX_OPERATIONS; const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(maxOperations) || maxOperations < 1 || !Number.isInteger(maxDepth) || maxDepth < 1) fail('validation budgets must be positive integers.');
  validateDefinition(schema, schema, '$');
  const context = { maxOperations, maxDepth, operations: 0, memo: new Map(), schemaIds: new WeakMap(), instanceIds: new WeakMap(), lastSchemaId: 0, lastInstanceId: 0 };
  validateNode(value, schema, schema, '$', context, 0); return value;
}
