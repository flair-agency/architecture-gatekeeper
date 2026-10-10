/** Internal validation for one decision returned by an already-prepared CI review. */
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys, MULTI_AUTHORITY_PROFILE } from '../authority-set.mjs';
import { validateAuthorityReviewSchema } from '../preflight-authority-set-review.mjs';
import { validatePreparedAuthorityDecision } from '../validate-authority-set-decision.mjs';
import { validateDecisionRules } from '../validate-decision.mjs';
import { validateJsonSchema } from '../json-schema.mjs';

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

export type PreparedCiDecisionBytes = string | Buffer;

/** Operational input shape; provenance and rules do not certify acceptance. */
export interface PreparedCiDecisionInput {
  responseBytes: PreparedCiDecisionBytes;
  schemaBytes: PreparedCiDecisionBytes;
  authorityProvenance: unknown;
  validationRules: Record<string, unknown> | null;
  maxResponseBytes: number;
  maxSchemaBytes: number;
}

function bytesOf(value: unknown, label: string): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new Error(`Prepared CI ${label} must be UTF-8 text or bytes.`);
}

function decodeBounded(value: unknown, label: string, maxBytes: number): string {
  const bytes = bytesOf(value, label);
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`Prepared CI ${label} is empty or exceeds its explicit byte limit.`);
  try { return utf8.decode(bytes); } catch { throw new Error(`Prepared CI ${label} is not valid UTF-8.`); }
}

/**
 * Validate decision text using only caller-prepared protected CI materials.
 * The caller remains responsible for binding those materials to protected
 * revisions, checking context completeness, and selecting the route/policy.
 */
export function validatePreparedCiDecision(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== INPUT_KEYS.size || Object.keys(input).some(key => !INPUT_KEYS.has(key))) {
    throw new Error('Prepared CI decision validation requires the complete explicit input set.');
  }
  const { maxResponseBytes, maxSchemaBytes } = input as Record<string, unknown>;
  if (!Number.isSafeInteger(maxResponseBytes) || (maxResponseBytes as number) < 1 || (maxResponseBytes as number) > MAX_CI_DECISION_BYTES) {
    throw new Error('Prepared CI response byte limit must be positive and within the 64 KiB runtime ceiling.');
  }
  if (!Number.isSafeInteger(maxSchemaBytes) || (maxSchemaBytes as number) < 1 || (maxSchemaBytes as number) > MAX_CI_SCHEMA_BYTES) {
    throw new Error('Prepared CI schema byte limit must be positive and within the 1 MiB runtime ceiling.');
  }
  if (!Object.hasOwn(input, 'validationRules') ||
      (input as Record<string, unknown>).validationRules !== null && (typeof (input as Record<string, unknown>).validationRules !== 'object' || Array.isArray((input as Record<string, unknown>).validationRules))) {
    throw new Error('Prepared CI validation rules must be an explicit rules object or null.');
  }

  const schemaText = decodeBounded((input as Record<string, unknown>).schemaBytes, 'schema', maxSchemaBytes as number);
  const responseText = decodeBounded((input as Record<string, unknown>).responseBytes, 'response', maxResponseBytes as number);
  let schema: unknown;
  try {
    schema = JSON.parse(schemaText);
    rejectDuplicateJsonKeys(schemaText, 'decision schema', { maxDepth: MAX_SCHEMA_JSON_DEPTH });
  } catch { throw new Error('Prepared CI decision schema is invalid JSON.'); }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Prepared CI decision schema must be a JSON Schema object.');
  }

  let decision: unknown;
  try {
    decision = JSON.parse(responseText);
    rejectDuplicateJsonKeys(responseText, 'decision', { maxDepth: MAX_DECISION_JSON_DEPTH });
  } catch { throw new Error('Prepared CI decision is invalid JSON.'); }

  validateJsonSchema(decision, schema);
  validateAuthorityReviewSchema(schema, ((input as Record<string, unknown>).authorityProvenance as { version?: unknown } | null | undefined)?.version === 2 ? MULTI_AUTHORITY_PROFILE : 'v1');
  validatePreparedAuthorityDecision(decision, (input as Record<string, unknown>).authorityProvenance);
  if ((input as Record<string, unknown>).validationRules !== null) validateDecisionRules(decision, (input as Record<string, unknown>).validationRules);
  return decision;
}
