import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

type UnknownRecord = Record<string, unknown>;

export interface OwnerAmendmentParsedAuthority extends UnknownRecord {
  id: string; path: string; previousSha256: string; newSha256: string;
}
export interface OwnerAmendmentBlockRecord {
  version: 2; repository: string; baseSha: string; headSha: string; policyRevision: string;
  authority: OwnerAmendmentParsedAuthority; triggeringReviewSha256: string; attestationBundleSha256: string; purpose: string;
}
export interface ValidateOwnerAmendmentG0TagEnvelopeInput {
  headSha: unknown; tag: unknown; tagRef: unknown; observedTagRefOid: unknown;
  reviewRecordBytes: unknown; amendmentRecordBytes: unknown; attestationBundleBytes: unknown;
}
export interface OwnerAmendmentG0TagEnvelopeResult {
  readonly profile: 'self-g0'; readonly headSha: unknown; readonly tagObjectOid: unknown;
  readonly reviewRecordSha256: string; readonly amendmentRecordSha256: string; readonly attestationBundleSha256: string;
}
export interface ValidateOwnerAmendmentG0ProcedureInput {
  policy: unknown; current: unknown; reviewRecord: unknown; amendmentRecord: unknown; tag: unknown;
}
export interface OwnerAmendmentG0ProcedureResult {
  readonly procedure: 'VALID_G0_AMENDMENT'; readonly grade: 'G0'; readonly repository: unknown;
  readonly baseSha: unknown; readonly headSha: unknown; readonly policyRevision: unknown; readonly authorityId: unknown;
  readonly reviewRecordSha256: string; readonly amendmentRecordSha256: string; readonly tagObjectOid: unknown;
  readonly principalAuthentication: 'not_verified';
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TAG_REF = /^refs\/tags\/architecture-gatekeeper\/amendments\/[a-z0-9][a-z0-9._-]{0,63}$/;
const TAG_OBJECT_MAX_BYTES = 262_144;
const REVIEW_RECORD_MAX_BYTES = 131_072;
const AMENDMENT_RECORD_MAX_BYTES = 8_192;
const ATTESTATION_BUNDLE_MAX_BYTES = 65_536;

function fail(message: string): never { throw new Error(`Owner amendment: ${message}`); }
function record(value: unknown, keys: readonly string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}
function requireMatch(value: unknown, regex: RegExp, label: string): void {
  if (typeof value !== 'string' || !regex.test(value)) fail(`${label} is invalid.`);
}
function requireSha(value: unknown, label: string, length?: number): void {
  if (typeof value !== 'string' || ![40, 64].includes(value.length) ||
      !/^[a-f0-9]+$/.test(value) || (length && value.length !== length)) fail(`${label} is invalid.`);
}
function requirePurpose(value: unknown): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 500 ||
      !/^[\x20-\x7e]+$/.test(value) || !value.trim()) fail('amendment purpose is invalid.');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as UnknownRecord)[key])]));
  }
  return value;
}

function parseCanonicalJson(bytes: unknown, label: string, maxBytes: number): unknown {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes) fail(`${label} is missing or oversized.`);
  let source: string;
  try { source = decoder.decode(bytes); } catch { fail(`${label} is not UTF-8.`); }
  let value: unknown;
  try { value = JSON.parse(source); } catch { fail(`${label} is not valid JSON.`); }
  // Canonical re-serialization rejects duplicate keys, alternate encodings,
  // whitespace and noncanonical key order in one deterministic comparison.
  if (JSON.stringify(canonical(value)) !== source) fail(`${label} JSON is not canonical.`);
  return value;
}

function decodeCanonicalBase64(value: unknown, label: string, maxBytes: number): Buffer {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(`${label} base64 is invalid or noncanonical.`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== value) fail(`${label} bytes are missing, oversized or noncanonical.`);
  return bytes;
}

/** Stable identity of a validated structured record, independent of JSON key order. */
export function digestOwnerAmendmentRecord(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function checkAuthority(value: UnknownRecord, label: string, withChange = false): void {
  record(value, withChange ? ['id', 'path', 'previousSha256', 'newSha256'] : ['id', 'path', 'sha256'], label);
  requireMatch(value.id, ID, `${label} ID`);
  requireMatch(value.path, PATH, `${label} path`);
  if ((value.path as string).length > 240 || (value.path as string).split('/').some(part => part === '.' || part === '..')) fail(`${label} path is invalid.`);
  for (const field of withChange ? ['previousSha256', 'newSha256'] : ['sha256']) {
    requireMatch(value[field], SHA256, `${label} ${field}`);
  }
}

/** Parse the strict, canonical v2 self-BLOCK AmendmentRecord profile.
 * This is an internal legacy transport record shared by the tag verifier and
 * BLOCK semantic adapter; callers still bind its values to trusted context.
 */
export function parseOwnerAmendmentBlockRecord(bytes: unknown): OwnerAmendmentBlockRecord {
  const amendment = parseCanonicalJson(bytes, 'self BLOCK AmendmentRecord', AMENDMENT_RECORD_MAX_BYTES) as UnknownRecord;
  record(amendment, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'authority',
    'triggeringReviewSha256', 'attestationBundleSha256', 'purpose'], 'self BLOCK AmendmentRecord');
  if (amendment.version !== 2) fail('self BLOCK AmendmentRecord version is invalid.');
  requireMatch(amendment.repository, REPOSITORY, 'self BLOCK AmendmentRecord repository');
  for (const field of ['baseSha', 'headSha', 'policyRevision']) requireSha(amendment[field], `self BLOCK AmendmentRecord ${field}`);
  checkAuthority(amendment.authority as UnknownRecord, 'self BLOCK AmendmentRecord authority', true);
  requireMatch(amendment.triggeringReviewSha256, SHA256, 'self BLOCK AmendmentRecord triggering ReviewRecord digest');
  requireMatch(amendment.attestationBundleSha256, SHA256, 'self BLOCK AmendmentRecord attestation bundle digest');
  requirePurpose(amendment.purpose);
  return amendment as unknown as OwnerAmendmentBlockRecord;
}

function validatePolicy(policy: UnknownRecord): void {
  record(policy, ['version', 'repository', 'revision', 'ownerAmendment'], 'protected policy');
  if (policy.version !== 1) fail('unsupported protected policy version.');
  requireMatch(policy.repository, REPOSITORY, 'protected repository');
  requireSha(policy.revision, 'protected policy revision');
  record(policy.ownerAmendment, ['grade', 'scope', 'authorities'], 'protected amendment policy');
  if ((policy.ownerAmendment as UnknownRecord).grade !== 'G0' || (policy.ownerAmendment as UnknownRecord).scope !== 'authority-only') {
    fail('protected policy does not select G0 authority-only amendments.');
  }
  const authorities = (policy.ownerAmendment as UnknownRecord).authorities;
  if (!Array.isArray(authorities) || !authorities.length || authorities.length > 32) fail('protected amendment authority list is invalid.');
  const ids = new Set<unknown>();
  const paths = new Set<unknown>();
  for (const authority of authorities as unknown[]) {
    record(authority, ['id', 'path'], 'allowed authority');
    requireMatch((authority as UnknownRecord).id, ID, 'allowed authority ID');
    requireMatch((authority as UnknownRecord).path, PATH, 'allowed authority path');
    if (((authority as UnknownRecord).path as string).length > 240 || ((authority as UnknownRecord).path as string).split('/').some(part => part === '.' || part === '..') ||
        ids.has((authority as UnknownRecord).id) || paths.has((authority as UnknownRecord).path)) fail('allowed authority is invalid or duplicated.');
    ids.add((authority as UnknownRecord).id);
    paths.add((authority as UnknownRecord).path);
  }
}

function validateCurrent(current: UnknownRecord, policy: UnknownRecord): void {
  record(current, ['repository', 'baseSha', 'headSha', 'policyRevision', 'baseAuthority', 'headAuthority', 'changedFiles', 'tagRefOid'], 'current state');
  if (current.repository !== policy.repository) fail('current repository differs from protected policy.');
  const length = (policy.revision as string).length;
  for (const key of ['baseSha', 'headSha', 'policyRevision', 'tagRefOid']) requireSha(current[key], `current ${key}`, length);
  if (current.baseSha === current.headSha || current.policyRevision !== policy.revision || current.policyRevision !== current.baseSha) {
    fail('current base, head or previous protected policy revision changed.');
  }
  checkAuthority(current.baseAuthority as UnknownRecord, 'base authority');
  checkAuthority(current.headAuthority as UnknownRecord, 'head authority');
  if ((current.baseAuthority as UnknownRecord).id !== (current.headAuthority as UnknownRecord).id || (current.baseAuthority as UnknownRecord).path !== (current.headAuthority as UnknownRecord).path ||
      (current.baseAuthority as UnknownRecord).sha256 === (current.headAuthority as UnknownRecord).sha256) fail('current authority identities or bytes are unchanged.');
  if (!((policy.ownerAmendment as UnknownRecord).authorities as unknown[]).some((item: unknown) => (item as UnknownRecord).id === (current.baseAuthority as UnknownRecord).id && (item as UnknownRecord).path === (current.baseAuthority as UnknownRecord).path)) {
    fail('protected policy does not authorize the affected authority.');
  }
  if (!Array.isArray(current.changedFiles) || current.changedFiles.length !== 1) fail('amendment must change exactly one authority file.');
  record((current.changedFiles as unknown[])[0], ['path', 'status'], 'changed file');
  if (((current.changedFiles as unknown[])[0] as UnknownRecord).path !== (current.baseAuthority as UnknownRecord).path || ((current.changedFiles as unknown[])[0] as UnknownRecord).status !== 'modified') {
    fail('amendment contains a non-authority, added, deleted or renamed file.');
  }
}

function validateReviewRecord(review: UnknownRecord, current: UnknownRecord): void {
  record(review, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'authority', 'reviewInputSha256', 'gatekeeperIdentity', 'decision', 'decisionSha256'], 'ReviewRecord');
  if (review.version !== 1 || review.repository !== current.repository) fail('ReviewRecord version or repository is invalid.');
  for (const key of ['baseSha', 'headSha', 'policyRevision']) requireSha(review[key], `ReviewRecord ${key}`, (current.baseSha as string).length);
  if (review.baseSha !== current.baseSha || review.policyRevision !== current.policyRevision) {
    fail('ReviewRecord is stale for the current protected base or policy.');
  }
  if (review.baseSha === review.headSha || review.headSha === current.headSha) fail('ReviewRecord does not identify a separate historical change.');
  requireMatch(review.reviewInputSha256, SHA256, 'ReviewRecord review input digest');
  if (typeof review.gatekeeperIdentity !== 'string' || !/^[A-Za-z0-9@._/-]{1,160}$/.test(review.gatekeeperIdentity)) fail('ReviewRecord Gatekeeper identity is invalid.');
  checkAuthority(review.authority as UnknownRecord, 'ReviewRecord authority');
  if ((review.authority as UnknownRecord).id !== (current.baseAuthority as UnknownRecord).id || (review.authority as UnknownRecord).path !== (current.baseAuthority as UnknownRecord).path ||
      (review.authority as UnknownRecord).sha256 !== (current.baseAuthority as UnknownRecord).sha256) fail('ReviewRecord was not against the previous authority.');
  record(review.decision, ['decision', 'authorityIds'], 'ReviewRecord decision');
  if ((review.decision as UnknownRecord).decision !== 'BLOCK' || !Array.isArray((review.decision as UnknownRecord).authorityIds) ||
      ((review.decision as UnknownRecord).authorityIds as unknown[]).length !== 1 || ((review.decision as UnknownRecord).authorityIds as unknown[])[0] !== (review.authority as UnknownRecord).id) {
    fail('ReviewRecord must contain the exact completed BLOCK decision for the affected authority.');
  }
  requireMatch(review.decisionSha256, SHA256, 'ReviewRecord decision digest');
  if (review.decisionSha256 !== digestOwnerAmendmentRecord(review.decision)) fail('ReviewRecord decision digest differs from its decision.');
}

function validateAmendmentRecord(amendment: UnknownRecord, reviewDigest: string, current: UnknownRecord): void {
  record(amendment, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'authority', 'triggeringReviewSha256', 'purpose'], 'AmendmentRecord');
  if (amendment.version !== 1 || amendment.repository !== current.repository ||
      amendment.baseSha !== current.baseSha || amendment.headSha !== current.headSha ||
      amendment.policyRevision !== current.policyRevision) fail('AmendmentRecord is stale or belongs to another change.');
  checkAuthority(amendment.authority as UnknownRecord, 'AmendmentRecord authority', true);
  if ((amendment.authority as UnknownRecord).id !== (current.baseAuthority as UnknownRecord).id || (amendment.authority as UnknownRecord).path !== (current.baseAuthority as UnknownRecord).path ||
      (amendment.authority as UnknownRecord).previousSha256 !== (current.baseAuthority as UnknownRecord).sha256 ||
      (amendment.authority as UnknownRecord).newSha256 !== (current.headAuthority as UnknownRecord).sha256) fail('AmendmentRecord authority binding differs from current state.');
  if (amendment.triggeringReviewSha256 !== reviewDigest) fail('AmendmentRecord does not bind the exact BLOCK ReviewRecord.');
  requirePurpose(amendment.purpose);
}

function validateTag(tag: UnknownRecord, current: UnknownRecord, amendment: UnknownRecord, reviewDigest: string, amendmentDigest: string): void {
  record(tag, ['ref', 'objectOid', 'objectBytes'], 'annotated tag');
  requireMatch(tag.ref, TAG_REF, 'annotated tag ref');
  requireSha(tag.objectOid, 'annotated tag OID', (current.headSha as string).length);
  if (tag.objectOid !== current.tagRefOid) fail('annotated tag ref has changed.');
  if (!Buffer.isBuffer(tag.objectBytes) || !tag.objectBytes.length || tag.objectBytes.length > 8_192) fail('annotated tag object bytes are missing or oversized.');
  const algorithm = (current.headSha as string).length === 40 ? 'sha1' : 'sha256';
  const computedOid = createHash(algorithm).update(Buffer.from(`tag ${tag.objectBytes.length}\0`)).update(tag.objectBytes).digest('hex');
  if (computedOid !== tag.objectOid) fail('annotated tag object OID is invalid.');
  let source;
  try { source = decoder.decode(tag.objectBytes); } catch { fail('annotated tag object is not UTF-8.'); }
  const separator = source.indexOf('\n\n');
  if (separator < 0) fail('annotated tag object has no message.');
  const headers = source.slice(0, separator).split('\n');
  if (headers.length !== 4 || headers[0] !== `object ${current.headSha}` || headers[1] !== 'type commit' ||
      headers[2] !== `tag ${(tag.ref as string).slice('refs/tags/'.length)}` ||
      !/^tagger [^\n<>]+ <[^\n<>]+> [0-9]+ [+-][0-9]{4}$/.test(headers[3])) {
    fail('annotated tag header does not bind the exact amendment commit and tag ref.');
  }
  const message = source.slice(separator + 2);
  const expectedMessage = `${JSON.stringify({ version: 1, purpose: amendment.purpose, reviewRecordSha256: reviewDigest, amendmentRecordSha256: amendmentDigest })}\n`;
  if (message !== expectedMessage) fail('annotated tag message does not bind the amendment purpose and records.');
}

function validateRawTagEnvelope(envelope: UnknownRecord, { headSha, tag, tagRef, observedTagRefOid, reviewRecordBytes, amendmentRecordBytes, attestationBundleBytes }: ValidateOwnerAmendmentG0TagEnvelopeInput): OwnerAmendmentG0TagEnvelopeResult {
  record(envelope, ['version', 'profile', 'bSha', 'reviewRecordBase64', 'reviewRecordSha256',
    'attestationBundleBase64', 'attestationBundleSha256', 'amendmentRecordBase64', 'amendmentRecordSha256'], 'tag evidence envelope');
  if (envelope.version !== 2 || envelope.profile !== 'self-g0' || envelope.bSha !== headSha) fail('tag evidence envelope does not bind exact B and self-G0 profile.');
  requireMatch(headSha, /^[a-f0-9]{40}$|^[a-f0-9]{64}$/, 'exact B SHA');
  record(tag, ['ref', 'objectOid', 'objectBytes'], 'annotated tag');
  requireMatch((tag as UnknownRecord).ref, TAG_REF, 'annotated tag ref');
  if ((tag as UnknownRecord).ref !== tagRef || observedTagRefOid !== (tag as UnknownRecord).objectOid) fail('observed annotated tag ref does not resolve to the exact requested object.');
  requireSha((tag as UnknownRecord).objectOid, 'annotated tag OID', (headSha as string).length);
  if (!Buffer.isBuffer((tag as UnknownRecord).objectBytes) || !((tag as UnknownRecord).objectBytes as Buffer).length || ((tag as UnknownRecord).objectBytes as Buffer).length > TAG_OBJECT_MAX_BYTES) fail('annotated tag object bytes are missing or oversized.');
  const algorithm = (headSha as string).length === 40 ? 'sha1' : 'sha256';
  const computedOid = createHash(algorithm).update(Buffer.from(`tag ${((tag as UnknownRecord).objectBytes as Buffer).length}\0`)).update((tag as UnknownRecord).objectBytes as Buffer).digest('hex');
  if (computedOid !== (tag as UnknownRecord).objectOid) fail('annotated tag object OID is invalid.');
  let source;
  try { source = decoder.decode((tag as UnknownRecord).objectBytes as Buffer); } catch { fail('annotated tag object is not UTF-8.'); }
  const separator = source.indexOf('\n\n');
  if (separator < 0) fail('annotated tag object has no message.');
  const headers = source.slice(0, separator).split('\n');
  if (headers.length !== 4 || headers[0] !== `object ${headSha}` || headers[1] !== 'type commit' ||
      headers[2] !== `tag ${((tag as UnknownRecord).ref as string).slice('refs/tags/'.length)}` ||
      !/^tagger [^\n<>]+ <[^\n<>]+> [0-9]+ [+-][0-9]{4}$/.test(headers[3])) fail('annotated tag header does not bind exact B and tag ref.');
  const message = source.slice(separator + 2);
  if (!message.endsWith('\n') || message.slice(0, -1).includes('\n')) fail('tag evidence envelope message must be one JSON line.');
  const parsed = parseCanonicalJson(Buffer.from(message.slice(0, -1)), 'tag evidence envelope', TAG_OBJECT_MAX_BYTES);
  if (JSON.stringify(parsed) !== JSON.stringify(envelope)) fail('tag evidence envelope differs from the tag message.');
  requireMatch(envelope.reviewRecordSha256, SHA256, 'envelope ReviewRecord digest');
  requireMatch(envelope.amendmentRecordSha256, SHA256, 'envelope AmendmentRecord digest');
  requireMatch(envelope.attestationBundleSha256, SHA256, 'envelope attestation bundle digest');
  const expectedBytes = [
    [envelope.reviewRecordBase64, envelope.reviewRecordSha256, reviewRecordBytes, REVIEW_RECORD_MAX_BYTES, 'ReviewRecord'],
    [envelope.amendmentRecordBase64, envelope.amendmentRecordSha256, amendmentRecordBytes, AMENDMENT_RECORD_MAX_BYTES, 'AmendmentRecord'],
    [envelope.attestationBundleBase64, envelope.attestationBundleSha256, attestationBundleBytes, ATTESTATION_BUNDLE_MAX_BYTES, 'attestation bundle'],
  ];
  for (const [encoded, digest, expected, maxBytes, label] of expectedBytes) {
    const embedded = decodeCanonicalBase64(encoded, `envelope ${label}`, maxBytes as number);
    if (!Buffer.isBuffer(expected) || !(expected as Buffer).length || (expected as Buffer).length > (maxBytes as number)) fail(`exact ${label} bytes are missing or oversized.`);
    const actualDigest = createHash('sha256').update(expected as Buffer).digest('hex');
    if (actualDigest !== digest || !embedded.equals(expected as Buffer)) fail(`tag envelope ${label} bytes or raw-byte digest differ.`);
  }
  // The self BLOCK handoff uses AmendmentRecord v2. Legacy v1 remains scoped
  // to validateOwnerAmendmentG0Procedure and keeps its original field set.
  const amendment = parseOwnerAmendmentBlockRecord(amendmentRecordBytes);
  if (amendment.headSha !== headSha ||
      amendment.triggeringReviewSha256 !== envelope.reviewRecordSha256 ||
      amendment.attestationBundleSha256 !== envelope.attestationBundleSha256) {
    fail('self BLOCK AmendmentRecord v2 does not bind exact B and evidence bytes.');
  }
  return Object.freeze({ profile: 'self-g0', headSha, tagObjectOid: (tag as UnknownRecord).objectOid,
    reviewRecordSha256: envelope.reviewRecordSha256, amendmentRecordSha256: envelope.amendmentRecordSha256 as string,
    attestationBundleSha256: envelope.attestationBundleSha256 });
}

/** Validate only the deterministic self-G0 tag envelope and byte bindings.
 * Callers must independently bind the v2 AmendmentRecord repository, previous
 * base/policy, affected authority and purpose to protected Git state, and prove
 * provenance plus a fresh remote tag-ref mapping before deriving acceptance.
 */
export function validateOwnerAmendmentG0TagEnvelope({ headSha, tag, tagRef, observedTagRefOid, reviewRecordBytes, amendmentRecordBytes, attestationBundleBytes }: ValidateOwnerAmendmentG0TagEnvelopeInput): OwnerAmendmentG0TagEnvelopeResult {
  if (!Buffer.isBuffer((tag as UnknownRecord | null | undefined)?.objectBytes) || !((tag as UnknownRecord).objectBytes as Buffer).length || ((tag as UnknownRecord).objectBytes as Buffer).length > TAG_OBJECT_MAX_BYTES) fail('annotated tag object bytes are missing or oversized.');
  const source = decoder.decode((tag as UnknownRecord).objectBytes as Buffer);
  const separator = source.indexOf('\n\n');
  if (separator < 0) fail('annotated tag object has no message.');
  const message = source.slice(separator + 2);
  if (!message.endsWith('\n')) fail('tag evidence envelope is missing its final newline.');
  const envelope = parseCanonicalJson(Buffer.from(message.slice(0, -1)), 'tag evidence envelope', TAG_OBJECT_MAX_BYTES);
  return validateRawTagEnvelope(envelope as UnknownRecord, { headSha, tag, tagRef, observedTagRefOid, reviewRecordBytes, amendmentRecordBytes, attestationBundleBytes });
}

/**
 * Validate the deterministic G0 procedure, not an acceptance decision. The
 * protected acceptance adapter must establish trusted provenance and current
 * freshness before it may derive OWNER_AMENDMENT. These records are an internal,
 * narrow G0 format; they do not define the general Issue #20 evidence schema.
 * The caller must source policy from the previous protected base and a
 * historical ReviewRecord from trusted review
 * evidence (never author-supplied PR JSON), and current state/changedFiles and
 * tagRefOid from fresh exact-base/head and remote-tag reads. This pure function
 * does not authenticate the tagger or establish provenance for caller inputs.
 */
export function validateOwnerAmendmentG0Procedure({ policy, current, reviewRecord, amendmentRecord, tag }: ValidateOwnerAmendmentG0ProcedureInput): OwnerAmendmentG0ProcedureResult {
  validatePolicy(policy as UnknownRecord);
  validateCurrent(current as UnknownRecord, policy as UnknownRecord);
  validateReviewRecord(reviewRecord as UnknownRecord, current as UnknownRecord);
  const reviewDigest = digestOwnerAmendmentRecord(reviewRecord);
  validateAmendmentRecord(amendmentRecord as UnknownRecord, reviewDigest, current as UnknownRecord);
  const amendmentDigest = digestOwnerAmendmentRecord(amendmentRecord);
  validateTag(tag as UnknownRecord, current as UnknownRecord, amendmentRecord as UnknownRecord, reviewDigest, amendmentDigest);
  return Object.freeze({
    procedure: 'VALID_G0_AMENDMENT', grade: 'G0',
    repository: (current as UnknownRecord).repository, baseSha: (current as UnknownRecord).baseSha, headSha: (current as UnknownRecord).headSha,
    policyRevision: (policy as UnknownRecord).revision, authorityId: ((current as UnknownRecord).baseAuthority as UnknownRecord).id,
    reviewRecordSha256: reviewDigest, amendmentRecordSha256: amendmentDigest,
    tagObjectOid: (tag as UnknownRecord).objectOid, principalAuthentication: 'not_verified',
  });
}
