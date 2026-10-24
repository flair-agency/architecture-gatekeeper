import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { MAX_AUTHORITY_LIMITS, rejectDuplicateJsonKeys } from '../authority-set.mjs';

export type OwnerAmendmentOwnerInitiatedAmendmentRecordInput = Readonly<{
  authority: unknown;
  repository: unknown;
  baseSha: unknown;
  bSha: unknown;
  authorityId: unknown;
  authorityPath: unknown;
  previousAuthorityBytes: unknown;
  amendedAuthorityBytes: unknown;
  authorityChanges: unknown;
  priorAuthoritySetDigest: unknown;
  resultingAuthoritySetDigest: unknown;
  purpose: unknown;
}>;
export type OwnerAmendmentOwnerInitiatedAmendmentRecord = Readonly<{
  version: 1;
  kind: 'owner-amendment-owner-initiated-amendment-record';
  triggerProfile: 'owner-initiated-self-v1';
  repository: string;
  baseSha: unknown;
  headSha: unknown;
  policyRevision: unknown;
  authority: Readonly<{ id: string; path: string; previousSha256: string; newSha256: string }>;
  changes: readonly OwnerAmendmentOwnerInitiatedAmendmentChange[];
  priorAuthoritySetDigest: string;
  resultingAuthoritySetDigest: string;
  historicalTrigger: 'none';
  purpose: string;
}>;
export type OwnerAmendmentOwnerInitiatedAmendmentChange = Readonly<{
  path: unknown;
  beforeSha256: string;
  afterSha256: string;
}>;
export type OwnerAmendmentOwnerInitiatedAmendmentBuildResult = Readonly<{
  record: OwnerAmendmentOwnerInitiatedAmendmentRecord;
  bytes: Buffer;
}>;
export type OwnerAmendmentOwnerInitiatedAmendmentRecordValidationInput = Readonly<{
  bytes?: unknown;
  expected?: unknown;
}>;
export type OwnerAmendmentOwnerInitiatedAmendmentRecordResult =
  | Readonly<{
      status: 'VERIFIED_OWNER_AMENDMENT_RECORD';
      repository: unknown;
      baseSha: unknown;
      bSha: unknown;
      policyRevision: unknown;
      triggerProfile: 'owner-initiated-self-v1';
      historicalTrigger: 'none';
      priorAuthoritySetDigest: unknown;
      resultingAuthoritySetDigest: unknown;
      authorityId: unknown;
      authorityPath: unknown;
      changes: readonly Readonly<Record<string, unknown>>[];
      targetValidated: true;
      purpose: string;
      reason?: never;
    }>
  | Readonly<{ status: 'INCOMPLETE'; reason: unknown }>;

type ErrorMessageView = { message: unknown };
type TriggerMemberView = { id?: unknown; path?: unknown; repository?: unknown; resolvedCommit?: unknown; sha256?: unknown; byteLength?: unknown };
type TriggerAuthorityView = {
  version?: unknown; selfRepository?: unknown; authorityRevision?: unknown; manifestSha256?: unknown;
  setDigest?: unknown; members?: unknown;
};
type ChangeObservationView = { path?: unknown; beforeBytes?: unknown; afterBytes?: unknown };
type ValidatedChange = OwnerAmendmentOwnerInitiatedAmendmentChange & Readonly<{
  beforeBytes: Buffer; afterBytes: Buffer; beforeByteLength: unknown; afterByteLength: unknown;
}>;
type AmendmentRecordAuthorityView = { id?: unknown; path?: unknown; previousSha256?: unknown; newSha256?: unknown };
type AmendmentRecordChangeView = Record<string, unknown> & { path?: unknown; beforeSha256?: unknown; afterSha256?: unknown };
type AmendmentRecordView = {
  version?: unknown; kind?: unknown; triggerProfile?: unknown; repository?: unknown; baseSha?: unknown;
  headSha?: unknown; policyRevision?: unknown; authority?: AmendmentRecordAuthorityView | null;
  changes?: unknown; priorAuthoritySetDigest?: unknown; resultingAuthoritySetDigest?: unknown;
  historicalTrigger?: unknown; purpose?: unknown;
};
type AmendmentRecordExpectedView = {
  repository?: unknown; baseSha?: unknown; bSha?: unknown; policyRevision?: unknown;
  triggerProfile?: unknown; historicalTrigger?: unknown; authoritySetDigest?: unknown;
  resultingAuthoritySetDigest?: unknown; authorityId?: unknown; authorityPath?: unknown; changes?: unknown;
};

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const fail: (message: string) => never = message => { throw new Error(`Owner amendment owner-initiated AmendmentRecord: ${message}`); };

function exact(value: unknown, keys: readonly string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value as object, key))) fail(`${label} has missing or unknown fields.`);
}

function json(bytes: unknown, label: string, max = 131_072): unknown {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > max) fail(`${label} bytes are missing or oversized.`);
  let source: string;
  try { source = decoder.decode(bytes); } catch { fail(`${label} is not UTF-8.`); }
  let value: unknown;
  try { rejectDuplicateJsonKeys(source, label); value = JSON.parse(source); } catch (error) { fail(`${label} JSON is invalid: ${(error as ErrorMessageView).message}`); }
  return value;
}

/**
 * Build a closed AmendmentRecord for the owner-initiated-self-v1
 * profile. This declaration does not authenticate owner choice or identity.
 */
export function buildOwnerAmendmentOwnerInitiatedAmendmentRecord({ authority, repository, baseSha, bSha, authorityId, authorityPath,
  previousAuthorityBytes, amendedAuthorityBytes, authorityChanges, priorAuthoritySetDigest,
  resultingAuthoritySetDigest, purpose }: OwnerAmendmentOwnerInitiatedAmendmentRecordInput): OwnerAmendmentOwnerInitiatedAmendmentBuildResult {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository) ||
      !SHA1.test((baseSha ?? '') as string) || !SHA1.test((bSha ?? '') as string) || baseSha === bSha) fail('repository, previous base, or exact B is invalid.');
  if (!Buffer.isBuffer(previousAuthorityBytes) || !previousAuthorityBytes.length || previousAuthorityBytes.length > 262_144 ||
      !Buffer.isBuffer(amendedAuthorityBytes) || !amendedAuthorityBytes.length || amendedAuthorityBytes.length > 262_144 ||
      digest(previousAuthorityBytes) === digest(amendedAuthorityBytes)) fail('exact changed authority bytes are invalid or unchanged.');
  if (typeof authorityId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(authorityId) ||
      typeof authorityPath !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(authorityPath) ||
      authorityPath.length > 240 || authorityPath.split('/').some(part => part === '.' || part === '..')) fail('target authority identity is invalid.');
  if (typeof purpose !== 'string' || !purpose.trim() || purpose.length > 500) fail('purpose is invalid.');

  validatePreviousMembers(authority, repository, baseSha);
  const trigger = { authority: authority as TriggerAuthorityView };
  const selected = ((authority as TriggerAuthorityView).members as TriggerMemberView[]).filter(member =>
    member.id === authorityId && member.path === authorityPath);
  if (selected.length !== 1 || selected[0].sha256 !== digest(previousAuthorityBytes)) {
    fail('selected target identity does not bind the complete previous Authority Set.');
  }

  const changes = validateChanges(authorityChanges, repository, baseSha);
  const target = changes.filter(change => change.path === authorityPath);
  if (target.length !== 1 || target[0].beforeSha256 !== digest(previousAuthorityBytes) ||
      target[0].afterSha256 !== digest(amendedAuthorityBytes)) {
    fail('complete authority changes do not bind the selected amendment target.');
  }
  const descriptors = ((trigger.authority as TriggerAuthorityView).members as TriggerMemberView[]).map((item: TriggerMemberView) => ({ id: item.id, repository: item.repository,
    resolvedCommit: item.resolvedCommit, path: item.path, byteLength: item.byteLength, sha256: item.sha256 }));
  const computedPriorDigest = digest(Buffer.from(JSON.stringify(descriptors)!, 'utf8'));
  const changesByPath = new Map(changes.map(change => [change.path, change]));
  for (const change of changes) {
    const descriptor = descriptors.find(item => item.repository === repository && item.resolvedCommit === baseSha &&
      item.path === change.path);
    if (!descriptor || descriptor.byteLength !== change.beforeByteLength || descriptor.sha256 !== change.beforeSha256) {
      fail(`changed authority ${change.path} does not bind its complete previous Authority Set member.`);
    }
  }
  const resultingDescriptors = descriptors.map(descriptor => {
    const change = changesByPath.get(descriptor.path as string);
    return change ? { ...descriptor, byteLength: change.afterByteLength, sha256: change.afterSha256 } : descriptor;
  });
  const resultingTotalBytes = resultingDescriptors.reduce((total, descriptor) => total + (descriptor.byteLength as number), 0);
  if (resultingTotalBytes > MAX_AUTHORITY_LIMITS.maxTotalBytes) {
    fail('resulting Authority Set exceeds the runtime total-byte ceiling.');
  }
  const computedResultingDigest = digest(Buffer.from(JSON.stringify(resultingDescriptors)!, 'utf8'));
  if ((trigger.authority as TriggerAuthorityView).setDigest !== computedPriorDigest || priorAuthoritySetDigest !== computedPriorDigest ||
      resultingAuthoritySetDigest !== computedResultingDigest) {
    fail('prior or resulting Authority Set digest does not match the exact changed authority bytes.');
  }
  const record: OwnerAmendmentOwnerInitiatedAmendmentRecord = Object.freeze({ version: 1, kind: 'owner-amendment-owner-initiated-amendment-record',
    triggerProfile: 'owner-initiated-self-v1', repository, baseSha, headSha: bSha,
    policyRevision: baseSha, authority: Object.freeze({ id: authorityId, path: authorityPath,
      previousSha256: digest(previousAuthorityBytes), newSha256: digest(amendedAuthorityBytes) }),
    changes: Object.freeze(changes.map(({ path: changedPath, beforeSha256, afterSha256 }) =>
      Object.freeze({ path: changedPath, beforeSha256, afterSha256 }))),
    priorAuthoritySetDigest: computedPriorDigest, resultingAuthoritySetDigest: computedResultingDigest,
    historicalTrigger: 'none', purpose });
  const bytes = Buffer.from(`${JSON.stringify(canonical(record))}\n`, 'utf8');
  if (bytes.length > 8_192) fail('AmendmentRecord exceeds its byte limit.');
  return Object.freeze({ record, bytes });
}

function validateChanges(authorityChanges: unknown, repository: string, baseSha: unknown): readonly ValidatedChange[] {
  if (!Array.isArray(authorityChanges) || authorityChanges.length < 1 || authorityChanges.length > 32) {
    fail('complete changed authority bytes are absent or exceed the supported member limit.');
  }
  let previousPath = '';
  return authorityChanges.map((change: unknown) => {
    exact(change, ['path', 'beforeBytes', 'afterBytes'], 'changed authority');
    if (typeof (change as ChangeObservationView).path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test((change as ChangeObservationView).path as string) ||
        ((change as ChangeObservationView).path as string).length > 240 || ((change as ChangeObservationView).path as string).split('/').some(part => part === '.' || part === '..') ||
        (previousPath && previousPath >= ((change as ChangeObservationView).path as string)) || !Buffer.isBuffer((change as ChangeObservationView).beforeBytes) || !((change as ChangeObservationView).beforeBytes as Buffer).length ||
        ((change as ChangeObservationView).beforeBytes as Buffer).length > MAX_AUTHORITY_LIMITS.maxFileBytes || !Buffer.isBuffer((change as ChangeObservationView).afterBytes) || !((change as ChangeObservationView).afterBytes as Buffer).length ||
        ((change as ChangeObservationView).afterBytes as Buffer).length > MAX_AUTHORITY_LIMITS.maxFileBytes || ((change as ChangeObservationView).beforeBytes as Buffer).equals((change as ChangeObservationView).afterBytes as Buffer)) {
      fail('changed authority bytes must be unique, sorted, bounded, and modified.');
    }
    previousPath = (change as ChangeObservationView).path as string;
    return Object.freeze({ path: (change as ChangeObservationView).path as string, beforeBytes: Buffer.from((change as ChangeObservationView).beforeBytes as Buffer),
      afterBytes: Buffer.from((change as ChangeObservationView).afterBytes as Buffer), beforeSha256: digest((change as ChangeObservationView).beforeBytes as Buffer),
      afterSha256: digest((change as ChangeObservationView).afterBytes as Buffer), beforeByteLength: ((change as ChangeObservationView).beforeBytes as Buffer).length,
      afterByteLength: ((change as ChangeObservationView).afterBytes as Buffer).length });
  });
}

function validatePreviousMembers(authority: unknown, repository: string, baseSha: unknown): void {
  exact(authority, ['version','selfRepository','authorityRevision','manifestSha256','setDigest','members'], 'trigger Authority Set');
  if ((authority as TriggerAuthorityView).version !== 1 || (authority as TriggerAuthorityView).selfRepository !== repository || (authority as TriggerAuthorityView).authorityRevision !== baseSha ||
      !Array.isArray((authority as TriggerAuthorityView).members) || !((authority as TriggerAuthorityView).members as unknown[]).length || ((authority as TriggerAuthorityView).members as unknown[]).length > 32 ||
      !SHA256.test(((authority as TriggerAuthorityView).manifestSha256 ?? '') as string) || !SHA256.test(((authority as TriggerAuthorityView).setDigest ?? '') as string)) {
    fail('trigger does not contain a complete previous self Authority Set.');
  }
  const ids = new Set();
  const paths = new Set();
  let totalBytes = 0;
  for (const member of (authority as TriggerAuthorityView).members as TriggerMemberView[]) {
    exact(member, ['id','repository','resolvedCommit','path','byteLength','sha256'], 'trigger Authority Set member');
    if (typeof member.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(member.id) || ids.has(member.id) ||
        member.repository !== repository || member.resolvedCommit !== baseSha ||
        typeof member.path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(member.path) ||
        member.path.length > 240 || member.path.split('/').some(part => part === '.' || part === '..') || paths.has(member.path) ||
        !Number.isSafeInteger(member.byteLength) || (member.byteLength as number) < 1 ||
        (member.byteLength as number) > MAX_AUTHORITY_LIMITS.maxFileBytes || !SHA256.test((member.sha256 ?? '') as string)) {
      fail('trigger Authority Set member is invalid, external, or duplicated.');
    }
    ids.add(member.id); paths.add(member.path); totalBytes += member.byteLength as number;
    if (totalBytes > MAX_AUTHORITY_LIMITS.maxTotalBytes) fail('trigger Authority Set exceeds the runtime total-byte ceiling.');
  }
}

/** Deterministically check fields required by the semantic producer/receipt. */
export function validateOwnerAmendmentOwnerInitiatedAmendmentRecord(
  { bytes, expected }: OwnerAmendmentOwnerInitiatedAmendmentRecordValidationInput = {},
): OwnerAmendmentOwnerInitiatedAmendmentRecordResult {
  try {
    const value = json(bytes, 'AmendmentRecord', 8_192) as AmendmentRecordView;
    exact(value, ['version', 'kind', 'triggerProfile', 'repository', 'baseSha', 'headSha', 'policyRevision',
      'authority', 'changes', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest',
      'historicalTrigger', 'purpose'], 'AmendmentRecord');
    exact(expected, ['repository', 'baseSha', 'bSha', 'policyRevision', 'triggerProfile', 'historicalTrigger',
      'authoritySetDigest', 'resultingAuthoritySetDigest', 'authorityId', 'authorityPath', 'changes'], 'expected protected AmendmentRecord bindings');
    exact(value.authority, ['id', 'path', 'previousSha256', 'newSha256'], 'AmendmentRecord authority');
    if (value.version !== 1 || value.kind !== 'owner-amendment-owner-initiated-amendment-record' ||
        value.triggerProfile !== 'owner-initiated-self-v1' || value.repository !== (expected as AmendmentRecordExpectedView).repository ||
        value.baseSha !== (expected as AmendmentRecordExpectedView).baseSha || value.headSha !== (expected as AmendmentRecordExpectedView).bSha || value.policyRevision !== (expected as AmendmentRecordExpectedView).policyRevision ||
        (expected as AmendmentRecordExpectedView).triggerProfile !== value.triggerProfile || value.historicalTrigger !== 'none' || (expected as AmendmentRecordExpectedView).historicalTrigger !== 'none' ||
        !SHA256.test(((value.authority as AmendmentRecordAuthorityView).previousSha256 ?? '') as string) || !SHA256.test(((value.authority as AmendmentRecordAuthorityView).newSha256 ?? '') as string) ||
        (value.authority as AmendmentRecordAuthorityView).previousSha256 === (value.authority as AmendmentRecordAuthorityView).newSha256 ||
        !SHA256.test((value.priorAuthoritySetDigest ?? '') as string) || !SHA256.test((value.resultingAuthoritySetDigest ?? '') as string) ||
        value.priorAuthoritySetDigest !== (expected as AmendmentRecordExpectedView).authoritySetDigest ||
        value.resultingAuthoritySetDigest !== (expected as AmendmentRecordExpectedView).resultingAuthoritySetDigest ||
        (value.authority as AmendmentRecordAuthorityView).id !== (expected as AmendmentRecordExpectedView).authorityId || (value.authority as AmendmentRecordAuthorityView).path !== (expected as AmendmentRecordExpectedView).authorityPath ||
        typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.length > 500) fail('AmendmentRecord does not bind protected owner-initiated inputs.');
    if (!Array.isArray((expected as AmendmentRecordExpectedView).changes) || !Array.isArray(value.changes) ||
        JSON.stringify(canonical(value.changes)) !== JSON.stringify(canonical((expected as AmendmentRecordExpectedView).changes))) {
      fail('AmendmentRecord does not bind every exact changed authority path and before/after digest.');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value.repository as string) ||
        !SHA1.test(value.baseSha as string) || !SHA1.test(value.headSha as string) || value.baseSha === value.headSha ||
        value.policyRevision !== value.baseSha || !/^[a-z][a-z0-9-]{0,63}$/.test(value.authority!.id as string)) fail('invalid exact repository/base/B/target binding.');
    if (value.changes.length < 1 || value.changes.length > 32) fail('invalid change count.');
    let previousPath = '';
    for (const change of value.changes as AmendmentRecordChangeView[]) {
      exact(change, ['path', 'beforeSha256', 'afterSha256'], 'AmendmentRecord change');
      if (typeof change.path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(change.path) ||
          change.path.length > 240 || change.path.split('/').some(part => part === '.' || part === '..') ||
          previousPath >= change.path || !SHA256.test(change.beforeSha256 as string) ||
          !SHA256.test(change.afterSha256 as string) || change.beforeSha256 === change.afterSha256) fail('invalid ordered changed authority binding.');
      previousPath = change.path;
    }
    const target = (value.changes as AmendmentRecordChangeView[]).filter((change: AmendmentRecordChangeView) => change.path === (value.authority as AmendmentRecordAuthorityView).path);
    if (target.length !== 1 || target[0].beforeSha256 !== (value.authority as AmendmentRecordAuthorityView).previousSha256 ||
        target[0].afterSha256 !== (value.authority as AmendmentRecordAuthorityView).newSha256) {
      fail('AmendmentRecord selected target does not match its complete changed-authority list.');
    }
    const canonicalBytes = `${JSON.stringify(canonical(value))}\n`;
    if (!(bytes as Buffer).equals(Buffer.from(canonicalBytes))) fail('AmendmentRecord bytes are not canonical producer bytes.');
    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository: value.repository,
      baseSha: value.baseSha, bSha: value.headSha, policyRevision: value.policyRevision,
      triggerProfile: value.triggerProfile, historicalTrigger: 'none',
      priorAuthoritySetDigest: (expected as AmendmentRecordExpectedView).authoritySetDigest, resultingAuthoritySetDigest: (expected as AmendmentRecordExpectedView).resultingAuthoritySetDigest,
      authorityId: (value.authority as AmendmentRecordAuthorityView).id, authorityPath: (value.authority as AmendmentRecordAuthorityView).path,
      changes: Object.freeze((value.changes as AmendmentRecordChangeView[]).map((change: AmendmentRecordChangeView) => Object.freeze({ ...change }))),
      targetValidated: true, purpose: value.purpose });
  } catch (error) { return Object.freeze({ status: 'INCOMPLETE', reason: (error as ErrorMessageView).message }); }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort((a, b) => {
    const aa = Array.from(a, c => c.codePointAt(0)!); const bb = Array.from(b, c => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return aa.length - bb.length;
  }).map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}
