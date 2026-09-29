import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys, validateAuthoritySetDecision } from './authority-set.mjs';
import { validateJsonSchema } from './json-schema.mjs';
import { validateDecisionRules } from './validate-decision.mjs';

const MAX_DECISION_BYTES = 65_536;
const MAX_RECORD_BYTES = 131_072;
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const INPUT_KEYS = Object.freeze(['manifest', 'policy', 'prompt', 'schema', 'validation']);

function fail(message) { throw new Error(`Owner amendment OWNER_DECISION record: ${message}`); }
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown fields.`);
}
function sha(value, regex, label) { if (typeof value !== 'string' || !regex.test(value)) fail(`${label} is invalid.`); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function parseDecision(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_DECISION_BYTES) fail('exact decision bytes are missing or oversized.');
  let source;
  try { source = DECODER.decode(bytes); } catch { fail('decision bytes are not UTF-8.'); }
  try { rejectDuplicateJsonKeys(source, 'decision'); return JSON.parse(source); }
  catch (error) { fail(`decision JSON is invalid: ${error.message}`); }
}

function validateContext(context) {
  exact(context, ['repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha', 'workflowPath', 'runId', 'runAttempt'], 'producer context');
  if (typeof context.repository !== 'string' || !REPOSITORY.test(context.repository) ||
      !Number.isSafeInteger(context.prNumber) || context.prNumber < 1 ||
      ![context.baseSha, context.headSha, context.mergeSha, context.workflowSha].every(value => SHA1.test(value)) ||
      typeof context.workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(context.workflowPath) ||
      ![context.runId, context.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value))) {
    fail('producer context values are invalid.');
  }
  if (context.baseSha === context.headSha || context.workflowSha !== context.baseSha) {
    fail('producer context is not bound to the immutable protected review base and change head.');
  }
  return context;
}

function validateAuthority(authority, context) {
  exact(authority, ['version', 'selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest', 'members'], 'authority provenance');
  if (authority.version !== 1 || authority.selfRepository !== context.repository || authority.authorityRevision !== context.baseSha ||
      !Array.isArray(authority.members) || !authority.members.length || authority.members.length > 32) {
    fail('authority provenance is incomplete or not from the protected review base.');
  }
  sha(authority.manifestSha256, SHA256, 'authority manifest digest');
  sha(authority.setDigest, SHA256, 'authority set digest');
  const ids = new Set();
  const descriptors = [];
  for (const member of authority.members) {
    exact(member, ['id', 'repository', 'resolvedCommit', 'path', 'byteLength', 'sha256'], 'authority member');
    if (typeof member.id !== 'string' || !ID.test(member.id) || ids.has(member.id) ||
        typeof member.repository !== 'string' || !REPOSITORY.test(member.repository) ||
        !Number.isSafeInteger(member.byteLength) || member.byteLength < 1 || member.byteLength > 131_072 ||
        typeof member.path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(member.path) ||
        member.path.length > 240 || member.path.split('/').some(part => part === '.' || part === '..')) {
      fail('authority member is invalid or duplicated.');
    }
    sha(member.resolvedCommit, SHA1, 'authority member revision');
    sha(member.sha256, SHA256, 'authority member digest');
    if (member.repository.toLowerCase() === context.repository.toLowerCase() && member.resolvedCommit !== context.baseSha) {
      fail('same-repository authority member is not from the protected review base.');
    }
    ids.add(member.id);
    descriptors.push({ id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: member.byteLength, sha256: member.sha256 });
  }
  if (digest(Buffer.from(JSON.stringify(descriptors), 'utf8')) !== authority.setDigest) {
    fail('authority set digest does not match the ordered member descriptors.');
  }
}

function validateInputDigests(inputDigests) {
  exact(inputDigests, INPUT_KEYS, 'protected input digests');
  for (const key of INPUT_KEYS) sha(inputDigests[key], SHA256, `protected ${key} digest`);
}

/** Build exact, versioned evidence for one completed OWNER_DECISION trigger.
 * This captures the historical escalation; it does not assess B's semantic
 * eligibility, authenticate owner choice, or authorize amendment adoption.
 * Callers must separately authenticate the producer and bind the record to
 * current protected host/Git evidence.
 */
export function buildOwnerAmendmentOwnerDecisionRecord({ decisionBytes, schema, validation, authority, context, inputDigests }) {
  context = validateContext(context);
  validateAuthority(authority, context);
  validateInputDigests(inputDigests);
  const decision = parseDecision(decisionBytes);
  validateJsonSchema(decision, schema);
  validateDecisionRules(decision, validation);
  if (decision.decision !== 'OWNER_DECISION') fail('only a completed OWNER_DECISION can produce this record.');
  validateAuthoritySetDecision(decision, authority);
  const record = {
    version: 1,
    kind: 'owner-amendment-owner-decision-review-record',
    ...context,
    authority,
    inputDigests,
    decisionSha256: digest(decisionBytes),
    decisionBytesBase64: decisionBytes.toString('base64'),
    decision,
  };
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_RECORD_BYTES) fail('record exceeds its byte limit.');
  return record;
}

/** Rebuild and compare exact record bytes against protected producer inputs. */
export function validateOwnerAmendmentOwnerDecisionRecord({ record, recordBytes, decisionBytes, schema, validation, authority, context, inputDigests }) {
  exact(record, ['version', 'kind', 'repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha', 'workflowPath', 'runId', 'runAttempt',
    'authority', 'inputDigests', 'decisionSha256', 'decisionBytesBase64', 'decision'], 'ReviewRecord');
  if (record.version !== 1 || record.kind !== 'owner-amendment-owner-decision-review-record') {
    fail('ReviewRecord version or kind is invalid.');
  }
  const rebuilt = buildOwnerAmendmentOwnerDecisionRecord({ decisionBytes, schema, validation, authority, context, inputDigests });
  const expectedBytes = Buffer.from(`${JSON.stringify(rebuilt)}\n`);
  if (!Buffer.isBuffer(recordBytes) || !recordBytes.equals(expectedBytes) ||
      JSON.stringify(canonical(record)) !== JSON.stringify(canonical(rebuilt))) {
    fail('ReviewRecord bytes differ from exact validated producer inputs.');
  }
  return rebuilt;
}
