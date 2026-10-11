import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys, validateAuthoritySetDecision } from '../authority-set.mjs';
import { validateJsonSchema } from '../json-schema.mjs';
import { validateDecisionRules } from '../validate-decision.mjs';

const MAX_DECISION_BYTES = 65_536;
const MAX_RECORD_BYTES = 131_072;
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const INPUT_KEYS = Object.freeze(['manifest', 'policy', 'prompt', 'schema', 'validation']);

export type OwnerAmendmentBlockProducerContext = Readonly<{
  repository?: unknown; prNumber?: unknown; baseSha?: unknown; headSha?: unknown; mergeSha?: unknown;
  workflowSha?: unknown; workflowPath?: unknown; runId?: unknown; runAttempt?: unknown;
}>;
export type OwnerAmendmentBlockInputDigests = Readonly<{
  manifest: unknown; policy: unknown; prompt: unknown; schema: unknown; validation: unknown;
}>;
export type BuildOwnerAmendmentBlockRecordInput = Readonly<{
  decisionBytes: unknown;
  schema: unknown;
  validation: unknown;
  authority: unknown;
  context: OwnerAmendmentBlockProducerContext;
  inputDigests: OwnerAmendmentBlockInputDigests;
}>;
export type OwnerAmendmentBlockRecord = {
  version: unknown;
  kind: unknown;
  repository?: unknown;
  prNumber?: unknown;
  baseSha?: unknown;
  headSha?: unknown;
  mergeSha?: unknown;
  workflowSha?: unknown;
  workflowPath?: unknown;
  runId?: unknown;
  runAttempt?: unknown;
  authority: unknown;
  inputDigests: unknown;
  decisionSha256: string;
  decisionBytesBase64: unknown;
  decision: unknown;
};
export type ValidateOwnerAmendmentBlockRecordInput = Readonly<{
  record: unknown;
  recordBytes: unknown;
  decisionBytes: unknown;
  schema: unknown;
  validation: unknown;
  authority: unknown;
  context: OwnerAmendmentBlockProducerContext;
  inputDigests: OwnerAmendmentBlockInputDigests;
}>;

type ContextView = {
  repository: unknown; prNumber: unknown; baseSha: unknown; headSha: unknown; mergeSha: unknown;
  workflowSha: unknown; workflowPath: unknown; runId: unknown; runAttempt: unknown;
};
type AuthorityView = {
  version: unknown; selfRepository: unknown; authorityRevision: unknown; manifestSha256: unknown;
  setDigest: unknown; members: unknown;
};
type AuthorityMemberView = {
  id: unknown; repository: unknown; resolvedCommit: unknown; path: unknown; byteLength: unknown; sha256: unknown;
};
type DigestView = Record<string, unknown>;
type DecisionView = { decision?: unknown };
type RecordShapeView = Record<string, unknown>;
type ErrorMessageView = { message: unknown };

function fail(message: unknown): never { throw new Error(`Owner amendment BLOCK record: ${message}`); }
function exact(value: unknown, keys: readonly string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown fields.`);
}
function sha(value: unknown, regex: RegExp, label: string): void {
  if (typeof value !== 'string' || !regex.test(value)) fail(`${label} is invalid.`);
}
function digest(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key =>
    [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}

function parseDecision(raw: unknown): unknown {
  if (!Buffer.isBuffer(raw) || !raw.length || raw.length > MAX_DECISION_BYTES) fail('exact decision bytes are missing or oversized.');
  let source: string;
  try { source = DECODER.decode(raw as Uint8Array); } catch { fail('decision bytes are not UTF-8.'); }
  let decision: unknown;
  try { rejectDuplicateJsonKeys(source, 'decision'); decision = JSON.parse(source) as unknown; }
  catch (error) { fail(`decision JSON is invalid: ${(error as ErrorMessageView).message}`); }
  return decision;
}

function validateContext(context: unknown): OwnerAmendmentBlockProducerContext {
  exact(context, ['repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha', 'workflowPath', 'runId', 'runAttempt'], 'producer context');
  if (typeof (context as ContextView).repository !== 'string' || !REPOSITORY.test((context as ContextView).repository as string) ||
      !Number.isSafeInteger((context as ContextView).prNumber as number) || ((context as ContextView).prNumber as number) < 1 ||
      ![(context as ContextView).baseSha, (context as ContextView).headSha, (context as ContextView).mergeSha, (context as ContextView).workflowSha].every(value => SHA1.test(value as string)) ||
      typeof (context as ContextView).workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test((context as ContextView).workflowPath as string) ||
      ![(context as ContextView).runId, (context as ContextView).runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value))) fail('producer context values are invalid.');
  if ((context as ContextView).baseSha === (context as ContextView).headSha || (context as ContextView).workflowSha !== (context as ContextView).baseSha) fail('producer context is not bound to the immutable protected A base and head.');
  return context as OwnerAmendmentBlockProducerContext;
}

function validateAuthority(authority: unknown, context: unknown): void {
  exact(authority, ['version', 'selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest', 'members'], 'authority provenance');
  if ((authority as AuthorityView).version !== 1 || (authority as AuthorityView).selfRepository !== (context as ContextView).repository ||
      (authority as AuthorityView).authorityRevision !== (context as ContextView).baseSha ||
      !Array.isArray((authority as AuthorityView).members) || !((authority as AuthorityView).members as unknown[]).length ||
      ((authority as AuthorityView).members as unknown[]).length > 32) fail('authority provenance is incomplete or not from A base.');
  sha((authority as AuthorityView).manifestSha256, SHA256, 'authority manifest digest');
  sha((authority as AuthorityView).setDigest, SHA256, 'authority set digest');
  const ids = new Set<unknown>();
  for (const member of (authority as AuthorityView).members as unknown[]) {
    exact(member, ['id', 'repository', 'resolvedCommit', 'path', 'byteLength', 'sha256'], 'authority member');
    if (typeof (member as AuthorityMemberView).id !== 'string' || !ID.test((member as AuthorityMemberView).id as string) || ids.has((member as AuthorityMemberView).id) ||
        typeof (member as AuthorityMemberView).repository !== 'string' || !REPOSITORY.test((member as AuthorityMemberView).repository as string) ||
        !Number.isSafeInteger((member as AuthorityMemberView).byteLength as number) || ((member as AuthorityMemberView).byteLength as number) < 1 ||
        ((member as AuthorityMemberView).byteLength as number) > 131_072 ||
        typeof (member as AuthorityMemberView).path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test((member as AuthorityMemberView).path as string) ||
        ((member as AuthorityMemberView).path as string).length > 240 || ((member as AuthorityMemberView).path as string).split('/').some(part => part === '.' || part === '..')) fail('authority member is invalid or duplicated.');
    sha((member as AuthorityMemberView).resolvedCommit, SHA1, 'authority member revision');
    sha((member as AuthorityMemberView).sha256, SHA256, 'authority member digest');
    ids.add((member as AuthorityMemberView).id);
  }
}

function validateInputDigests(inputDigests: unknown): void {
  exact(inputDigests, INPUT_KEYS, 'protected input digests');
  for (const key of INPUT_KEYS) sha((inputDigests as DigestView)[key], SHA256, `protected ${key} digest`);
}

/** Build the bounded, deterministic producer record for one fully validated historical BLOCK. */
export function buildOwnerAmendmentBlockRecord({ decisionBytes, schema, validation, authority, context, inputDigests }: BuildOwnerAmendmentBlockRecordInput): OwnerAmendmentBlockRecord {
  context = validateContext(context);
  validateAuthority(authority, context);
  validateInputDigests(inputDigests);
  const decision = parseDecision(decisionBytes);
  validateJsonSchema(decision, schema);
  validateDecisionRules(decision, validation);
  if ((decision as DecisionView).decision !== 'BLOCK') fail('only a top-level completed BLOCK can produce this record.');
  validateAuthoritySetDecision(decision, authority);
  // validateContext established the producer-context keys before this same
  // spread; the erased output view keeps externally supplied values unknown.
  const record = {
    version: 1,
    kind: 'owner-amendment-block-review-record',
    ...(context as object),
    authority,
    inputDigests,
    decisionSha256: digest(decisionBytes as Buffer),
    decisionBytesBase64: (decisionBytes as Buffer).toString('base64'),
    decision,
  } as unknown as OwnerAmendmentBlockRecord;
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_RECORD_BYTES) fail('record exceeds its byte limit.');
  return record;
}

/** Rebuild and compare a record against its exact producer inputs; returns a fresh canonical record. */
export function validateOwnerAmendmentBlockRecord({ record, recordBytes, decisionBytes, schema, validation, authority, context, inputDigests }: ValidateOwnerAmendmentBlockRecordInput): OwnerAmendmentBlockRecord {
  exact(record, ['version', 'kind', 'repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha', 'workflowPath', 'runId', 'runAttempt',
    'authority', 'inputDigests', 'decisionSha256', 'decisionBytesBase64', 'decision'], 'record');
  if ((record as RecordShapeView).version !== 1 || (record as RecordShapeView).kind !== 'owner-amendment-block-review-record') fail('record version or kind is invalid.');
  const rebuilt = buildOwnerAmendmentBlockRecord({ decisionBytes, schema, validation, authority, context, inputDigests });
  const expectedBytes = Buffer.from(`${JSON.stringify(rebuilt)}\n`);
  if (!Buffer.isBuffer(recordBytes) || !(recordBytes as Buffer).equals(expectedBytes) || JSON.stringify(canonical(record)) !== JSON.stringify(canonical(rebuilt))) {
    fail('record bytes differ from exact validated producer inputs.');
  }
  return rebuilt;
}
