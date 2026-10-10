import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePreparedCiDecision } from '../dist/prepared-ci-decision.mjs';

test('preserves provenance version getter and subsequent input getter reads in order', () => {
  const reads = [];
  const ids = ['architecture-contract', 'architecture-authority-set', 'architecture-owner-addition', 'architecture-owner-amendment', 'architecture-review-execution', 'architecture-self-profile'];
  const schema = { type: 'object', additionalProperties: false, required: ['decision', 'authorityIds'], properties: { decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, authorityIds: { type: 'array', minItems: 6, items: { type: 'string' } } } };
  const provenance = { get version() { reads.push('version'); return 1; }, manifestSha256: 'a'.repeat(64), setDigest: 'b'.repeat(64), members: ids.map(id => ({ id })) };
  const input = {
    responseBytes: JSON.stringify({ decision: 'PASS', authorityIds: ids }), schemaBytes: JSON.stringify(schema),
    get authorityProvenance() {
      reads.push('provenance');
      return provenance;
    },
    validationRules: null, maxResponseBytes: 1000, maxSchemaBytes: 1000,
  };
  assert.deepEqual(validatePreparedCiDecision(input).decision, 'PASS');
  assert.deepEqual(reads, ['provenance', 'version', 'provenance', 'version', 'version']);
});
