import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseAuthorityManifest, rejectDuplicateJsonKeys } from '../dist/authority-set.mjs';
import { validatePreparedCiDecision } from '../dist/prepared-ci-decision.mjs';

const ids = [
  'architecture-contract', 'architecture-authority-set', 'architecture-owner-addition',
  'architecture-owner-amendment', 'architecture-review-execution', 'architecture-self-profile',
];
const schema = {
  type: 'object', additionalProperties: false, required: ['decision', 'authorityIds'],
  properties: {
    decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
    authorityIds: { type: 'array', minItems: 6, items: { type: 'string' } },
    summary: { type: 'string' },
  },
};
const provenance = {
  version: 1, manifestSha256: 'a'.repeat(64), setDigest: 'b'.repeat(64),
  members: ids.map(id => ({ id })),
};
const rules = { version: 1, rules: [{
  when: { path: '/decision', equals: 'BLOCK' },
  require: { path: '/summary', equals: 'documented' },
  message: 'BLOCK requires its reason to be documented.',
}] };
const MAX_RESPONSE_BYTES = 65_536;
const MAX_SCHEMA_BYTES = 1_048_576;
const schemaText = JSON.stringify(schema);

function input(decision, overrides = {}) {
  return {
    responseBytes: Buffer.from(JSON.stringify(decision)), schemaBytes: Buffer.from(schemaText),
    authorityProvenance: provenance, validationRules: null,
    maxResponseBytes: MAX_RESPONSE_BYTES, maxSchemaBytes: MAX_SCHEMA_BYTES,
    ...overrides,
  };
}

test('validates PASS, BLOCK and OWNER_DECISION with the complete six-member prepared set', () => {
  for (const kind of ['PASS', 'BLOCK', 'OWNER_DECISION']) {
    const decision = { decision: kind, authorityIds: ids };
    assert.deepEqual(validatePreparedCiDecision(input(decision)), decision);
  }
  assert.deepEqual(validatePreparedCiDecision(input({ decision: 'BLOCK', authorityIds: ids, summary: 'documented' }, { validationRules: rules })).summary, 'documented');
});

test('rejects missing, extra and duplicate authority IDs through the prepared Authority Set validator', () => {
  for (const authorityIds of [ids.slice(1), [...ids, 'extra-source'], [ids[0], ...ids.slice(1, 5), ids[0]]]) {
    assert.throws(() => validatePreparedCiDecision(input({ decision: 'PASS', authorityIds })));
  }
});

test('applies explicit consumer rules and rejects a BLOCK missing its required reason', () => {
  assert.throws(() => validatePreparedCiDecision(input({ decision: 'BLOCK', authorityIds: ids }, { validationRules: rules })), /BLOCK requires its reason/);
  assert.throws(() => validatePreparedCiDecision(input({ decision: 'PASS', authorityIds: ids }, {
    validationRules: { version: 1, rules: [{ when: { path: '/decision', equals: 'PASS' }, require: { path: '/summary', equals: 'complete' }, message: 'PASS requires scope.' }] },
  })), /PASS requires scope/);
});

test('supports existing v2 prepared provenance validation without changing its binding rules', () => {
  const baseSha = 'c'.repeat(40);
  const members = ids.map(id => ({ id, repository: 'flair-agency/test', resolvedCommit: baseSha,
    path: `docs/${id}.md`, byteLength: 1, sha256: 'd'.repeat(64) }));
  const setDigest = createHash('sha256').update(JSON.stringify(members)).digest('hex');
  const authorityProvenance = { version: 2, selfRepository: 'flair-agency/test', authorityRevision: baseSha,
    manifestSha256: 'e'.repeat(64), setDigest, members };
  const decision = { decision: 'OWNER_DECISION', authorityIds: ids, authoritySetDigest: setDigest, ownerDecisionId: 'protected-owner-decision-id' };
  const v2SchemaText = JSON.stringify({ ...schema,
    required: [...schema.required, 'authoritySetDigest', 'ownerDecisionId'],
    properties: { ...schema.properties, authoritySetDigest: { type: 'string' }, ownerDecisionId: { type: 'string', minLength: 1 } },
  });
  assert.deepEqual(validatePreparedCiDecision(input(decision, { authorityProvenance,
    schemaBytes: Buffer.from(v2SchemaText) })), decision);
  const missingId = { ...decision };
  delete missingId.ownerDecisionId;
  assert.throws(() => validatePreparedCiDecision(input(missingId, { authorityProvenance, schemaBytes: v2SchemaText })), /ownerDecisionId is required/);
  const unboundSchema = JSON.parse(v2SchemaText);
  unboundSchema.required = unboundSchema.required.filter(key => key !== 'ownerDecisionId');
  delete unboundSchema.properties.ownerDecisionId;
  assert.throws(() => validatePreparedCiDecision(input(missingId, { authorityProvenance, schemaBytes: JSON.stringify(unboundSchema) })), /must require authoritySetDigest and ownerDecisionId/);
});

test('rejects malformed JSON, duplicate JSON keys, invalid schema and invalid UTF-8', () => {
  const good = input({ decision: 'PASS', authorityIds: ids });
  assert.throws(() => validatePreparedCiDecision({ ...good, responseBytes: Buffer.from('{bad') }), /decision is invalid JSON/);
  assert.throws(() => validatePreparedCiDecision({ ...good, responseBytes: Buffer.from('{"decision":"PASS","decision":"BLOCK"}') }), /decision is invalid JSON/);
  assert.throws(() => validatePreparedCiDecision({ ...good, schemaBytes: Buffer.from('{"type":"object","badKeyword":true}') }), /unsupported keyword/);
  assert.throws(() => validatePreparedCiDecision({ ...good, responseBytes: Buffer.from([0xff]) }), /not valid UTF-8/);
});

test('requires explicit finite byte limits and rejects oversize before parsing without truncation', () => {
  const good = input({ decision: 'PASS', authorityIds: ids });
  assert.throws(() => validatePreparedCiDecision({ ...good, maxResponseBytes: undefined }), /explicit input set|response byte limit/);
  assert.throws(() => validatePreparedCiDecision({ ...good, maxResponseBytes: MAX_RESPONSE_BYTES + 1 }), /64 KiB runtime ceiling/);
  assert.throws(() => validatePreparedCiDecision({ ...good, maxSchemaBytes: MAX_SCHEMA_BYTES + 1 }), /1 MiB runtime ceiling/);
  assert.throws(() => validatePreparedCiDecision({ ...good, responseBytes: Buffer.alloc(MAX_RESPONSE_BYTES + 1), maxResponseBytes: MAX_RESPONSE_BYTES }), /response is empty or exceeds/);
  assert.throws(() => validatePreparedCiDecision({ ...good, schemaBytes: Buffer.alloc(MAX_SCHEMA_BYTES + 1), maxSchemaBytes: MAX_SCHEMA_BYTES }), /schema is empty or exceeds/);
});

test('requires explicit null when the caller selected no extra validation rules', () => {
  const good = input({ decision: 'PASS', authorityIds: ids });
  delete good.validationRules;
  assert.throws(() => validatePreparedCiDecision(good), /complete explicit input set/);
  assert.deepEqual(validatePreparedCiDecision(input({ decision: 'PASS', authorityIds: ids }, { validationRules: null })).decision, 'PASS');
});

test('rejects unsupported input fields rather than silently ignoring caller selection', () => {
  const good = input({ decision: 'PASS', authorityIds: ids });
  assert.throws(() => validatePreparedCiDecision({ ...good, provider: 'gemini' }), /complete explicit input set/);
});

test('accepts schema and decision nesting beyond the manifest parser default depth', () => {
  let nestedSchema = { type: 'string' };
  let nestedValue = 'leaf';
  for (let index = 0; index < 12; index += 1) {
    nestedSchema = { type: 'object', additionalProperties: false, required: ['next'], properties: { next: nestedSchema } };
    nestedValue = { next: nestedValue };
  }
  const deepSchema = { ...schema, required: [...schema.required, 'nested'], properties: { ...schema.properties, nested: nestedSchema } };
  const decision = { decision: 'PASS', authorityIds: ids, nested: nestedValue };
  const parsed = validatePreparedCiDecision(input(decision, {
    schemaBytes: Buffer.from(JSON.stringify(deepSchema)),
  }));
  assert.deepEqual(parsed.nested, nestedValue);
});

test('accepts a semantic schema and decision depth of 256 within the explicit CI bounds', () => {
  let nestedSchema = { type: 'string' };
  let nestedValue = 'leaf';
  for (let index = 0; index < 255; index += 1) {
    nestedSchema = { type: 'object', additionalProperties: false, required: ['next'], properties: { next: nestedSchema } };
    nestedValue = { next: nestedValue };
  }
  const deepSchema = { ...schema, required: [...schema.required, 'nested'], properties: { ...schema.properties, nested: nestedSchema } };
  const decision = { decision: 'PASS', authorityIds: ids, nested: nestedValue };
  const responseBytes = Buffer.from(JSON.stringify(decision));
  const schemaBytes = Buffer.from(JSON.stringify(deepSchema));
  assert.ok(responseBytes.length < MAX_RESPONSE_BYTES);
  assert.ok(schemaBytes.length < MAX_SCHEMA_BYTES);
  assert.deepEqual(validatePreparedCiDecision(input(decision, { schemaBytes })).nested, nestedValue);
});

test('deep duplicate keys remain rejected, scanner overflow is bounded, and manifests keep depth eight', () => {
  const duplicateAtDepth = `${'{"layer":'.repeat(12)}{"duplicate":1,"duplicate":2}${'}'.repeat(12)}`;
  assert.throws(() => rejectDuplicateJsonKeys(duplicateAtDepth, 'decision', { maxDepth: 256 }), /duplicate JSON key/);

  const tooDeepDecision = `${'{"layer":'.repeat(257)}null${'}'.repeat(257)}`;
  assert.throws(() => rejectDuplicateJsonKeys(tooDeepDecision, 'decision', { maxDepth: 256 }), /nesting is too deep/);
  const tooDeepSchema = `${'{"layer":'.repeat(515)}null${'}'.repeat(515)}`;
  assert.throws(() => rejectDuplicateJsonKeys(tooDeepSchema, 'decision schema', { maxDepth: 514 }), /nesting is too deep/);
  assert.throws(() => rejectDuplicateJsonKeys('{}', 'decision schema', { maxDepth: 515 }), /depth must be within 1\.\.514/);

  let manifestNested = null;
  for (let index = 0; index < 9; index += 1) manifestNested = { nested: manifestNested };
  const manifest = { version: 1, authorities: [{ id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' }], extra: manifestNested };
  assert.throws(() => parseAuthorityManifest(JSON.stringify(manifest), {
    maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 65_536,
    maxTotalBytes: 262_144, maxPromptBytes: 524_288,
  }), /manifest nesting is too deep/);
});


test('truncated schema and response JSON reject without hanging the synchronous validator', () => {
  const moduleUrl = new URL('../dist/prepared-ci-decision.mjs', import.meta.url).href;
  const good = input({ decision: 'PASS', authorityIds: ids }, {
    responseBytes: JSON.stringify({ decision: 'PASS', authorityIds: ids }), schemaBytes: schemaText,
  });
  const script = `
    import assert from 'node:assert/strict';
    import { validatePreparedCiDecision } from ${JSON.stringify(moduleUrl)};
    const good = ${JSON.stringify(good)};
    for (const field of ['responseBytes', 'schemaBytes']) {
      for (const truncated of ['[', '[1,', '{"x":[', '{"x":', '{', '"unterminated']) {
        assert.throws(() => validatePreparedCiDecision({ ...good, [field]: truncated }), /invalid JSON/);
      }
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
