import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJsonSchema } from '../src/json-schema.mjs';

const recursiveSchema = {
  description: 'recursive linked values',
  $defs: {
    node: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'next'],
          properties: {
            value: { type: 'string', description: 'current value' },
            next: { $ref: '#/$defs/node' }
          }
        }
      ]
    }
  },
  $ref: '#/$defs/node'
};

test('validates description, $defs, recursive local $ref and anyOf', () => {
  const value = { value: 'first', next: { value: 'second', next: null } };
  assert.equal(validateJsonSchema(value, recursiveSchema), value);
  assert.throws(() => validateJsonSchema({ value: 'first', next: 3 }, recursiveSchema), /does not match any anyOf branch/);
});

test('fails closed on unsupported keywords and invalid local references', () => {
  assert.throws(() => validateJsonSchema('x', { type: 'string', pattern: 'x' }), /unsupported keyword pattern/);
  assert.throws(() => validateJsonSchema('x', { $ref: 'https://example.invalid/schema' }), /local URI fragment JSON Pointer/);
  assert.throws(() => validateJsonSchema('x', { $ref: '#/$defs/missing', $defs: {} }), /cannot resolve/);
});

test('detects malformed keywords by own property instead of truthiness', () => {
  for (const schema of [
    { enum: null },
    { type: null },
    { anyOf: null },
    { $defs: null },
    { properties: null },
    { items: null },
    { required: null },
    { additionalProperties: null },
    { minItems: null },
    { minLength: null },
    { minimum: null },
    { maximum: null },
    { description: null }
  ]) assert.throws(() => validateJsonSchema(null, schema), /Decision schema validation failed/);
});

test('supports nullable type arrays and enum null values', () => {
  assert.equal(validateJsonSchema(null, { type: ['string', 'null'], enum: ['ready', null] }), null);
  assert.equal(validateJsonSchema('ready', { type: ['string', 'null'], enum: ['ready', null] }), 'ready');
});

test('decodes URI fragments before applying JSON Pointer escapes', () => {
  const schema = { $defs: { 'a/b~c': { type: 'string' } }, $ref: '#/%24defs/a%7E1b%7E0c' };
  assert.equal(validateJsonSchema('value', schema), 'value');
  assert.throws(() => validateJsonSchema('value', { $ref: '#/%ZZ' }), /malformed percent encoding/);
});

function linked(depth) { let value = null; for (let index = 0; index < depth; index += 1) value = { next: value }; return value; }
function overlappingRecursiveSchema() {
  const branch = () => ({ type: 'object', additionalProperties: false, required: ['next'], properties: { next: { $ref: '#/$defs/node' } } });
  return { $defs: { node: { anyOf: [{ type: 'null' }, branch(), branch(), branch(), branch()] } }, $ref: '#/$defs/node' };
}

test('memoizes overlapping recursive anyOf validation at practical depth', () => {
  const started = performance.now();
  const value = linked(20);
  assert.equal(validateJsonSchema(value, overlappingRecursiveSchema()), value);
  assert.ok(performance.now() - started < 1000);
});

test('fails closed on explicit operation, depth and nonprogress cycle limits', () => {
  const schema = overlappingRecursiveSchema();
  assert.throws(() => validateJsonSchema(linked(20), schema, { maxOperations: 10, maxDepth: 256 }), /operation budget exceeded \(10\)/);
  assert.throws(() => validateJsonSchema(linked(20), schema, { maxOperations: 100000, maxDepth: 5 }), /depth budget exceeded \(5\)/);
  assert.throws(() => validateJsonSchema('primitive', { $ref: '#' }), /without instance progress/);
});
