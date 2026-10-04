/** Internal validation for one decision returned by an already-prepared CI review. */
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';
import { validatePreparedAuthorityDecision } from './validate-authority-set-decision.mjs';
import { validateDecisionRules } from './validate-decision.mjs';
import { validateJsonSchema } from './json-schema.mjs';

const INPUT_KEYS = new Set([
  'responseBytes', 'schemaBytes', 'authorityProvenance', 'validationRules', 'maxResponseBytes', 'maxSchemaBytes',
]);
const MAX_CI_DECISION_BYTES = 65_536;
const MAX_CI_SCHEMA_BYTES = 1_048_576;
// Schema JSON contains wrapper objects such as `properties` at each semantic
// schema level; this bounds textual container depth while permitting the
// validator's 256-level semantic limit plus the final leaf keyword value.
// Decision instances use 256 directly.
const MAX_SCHEMA_JSON_DEPTH = 514;
const MAX_DECISION_JSON_DEPTH = 256;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function bytesOf(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new Error(`Prepared CI ${label} must be UTF-8 text or bytes.`);
}

function decodeBounded(value, label, maxBytes) {
  const bytes = bytesOf(value, label);
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`Prepared CI ${label} is empty or exceeds its explicit byte limit.`);
  try { return utf8.decode(bytes); } catch { throw new Error(`Prepared CI ${label} is not valid UTF-8.`); }
}

/**
 * Validate decision text using only caller-prepared protected CI materials.
 * The caller remains responsible for binding those materials to protected
 * revisions, checking context completeness, and selecting the route/policy.
 */
export function validatePreparedCiDecision(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== INPUT_KEYS.size || Object.keys(input).some(key => !INPUT_KEYS.has(key))) {
    throw new Error('Prepared CI decision validation requires the complete explicit input set.');
  }
  const { maxResponseBytes, maxSchemaBytes } = input;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > MAX_CI_DECISION_BYTES) {
    throw new Error('Prepared CI response byte limit must be positive and within the 64 KiB runtime ceiling.');
  }
  if (!Number.isSafeInteger(maxSchemaBytes) || maxSchemaBytes < 1 || maxSchemaBytes > MAX_CI_SCHEMA_BYTES) {
    throw new Error('Prepared CI schema byte limit must be positive and within the 1 MiB runtime ceiling.');
  }
  if (!Object.hasOwn(input, 'validationRules') ||
      (input.validationRules !== null && (typeof input.validationRules !== 'object' || Array.isArray(input.validationRules)))) {
    throw new Error('Prepared CI validation rules must be an explicit rules object or null.');
  }

  const schemaText = decodeBounded(input.schemaBytes, 'schema', maxSchemaBytes);
  const responseText = decodeBounded(input.responseBytes, 'response', maxResponseBytes);
  let schema;
  try {
    schema = JSON.parse(schemaText);
    rejectDuplicateJsonKeys(schemaText, 'decision schema', { maxDepth: MAX_SCHEMA_JSON_DEPTH });
  } catch { throw new Error('Prepared CI decision schema is invalid JSON.'); }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Prepared CI decision schema must be a JSON Schema object.');
  }

  let decision;
  try {
    decision = JSON.parse(responseText);
    rejectDuplicateJsonKeys(responseText, 'decision', { maxDepth: MAX_DECISION_JSON_DEPTH });
  } catch { throw new Error('Prepared CI decision is invalid JSON.'); }

  validateJsonSchema(decision, schema);
  validatePreparedAuthorityDecision(decision, input.authorityProvenance);
  if (input.validationRules !== null) validateDecisionRules(decision, input.validationRules);
  return decision;
}
