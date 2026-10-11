import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { MAX_AUTHORITY_LIMITS, rejectDuplicateJsonKeys } from '../authority-set.mjs';

export type OwnerAmendmentOwnerDecisionAmendmentRecordInput = Readonly<{
  reviewRecordBytes: unknown;
  attestationBundleBytes: unknown;
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
export type OwnerAmendmentOwnerDecisionAmendmentRecord = Readonly<{
  version: 2;
  kind: 'owner-amendment-owner-decision-amendment-record';
  triggerProfile: 'completed-owner-decision-self-v1';
  repository: string;
  baseSha: unknown;
  headSha: unknown;
  policyRevision: unknown;
  authority: Readonly<{ id: string; path: string; previousSha256: string; newSha256: string }>;
  changes: readonly OwnerAmendmentOwnerDecisionAmendmentChange[];
  priorAuthoritySetDigest: string;
  resultingAuthoritySetDigest: string;
  triggeringReviewSha256: string;
  attestationBundleSha256: string;
  purpose: string;
}>;
export type OwnerAmendmentOwnerDecisionAmendmentChange = Readonly<{
  path: unknown;
  beforeSha256: string;
  afterSha256: string;
}>;
export type OwnerAmendmentOwnerDecisionAmendmentBuildResult = Readonly<{
  record: OwnerAmendmentOwnerDecisionAmendmentRecord;
  bytes: Buffer;
}>;
export type OwnerAmendmentOwnerDecisionAmendmentRecordValidationInput = Readonly<{
  bytes?: unknown;
  expected?: unknown;
}>;
export type OwnerAmendmentOwnerDecisionAmendmentRecordResult =
  | Readonly<{
      status: 'VERIFIED_OWNER_AMENDMENT_RECORD';
      repository: unknown;
      baseSha: unknown;
      bSha: unknown;
      policyRevision: unknown;
      triggerProfile: 'completed-owner-decision-self-v1';
      triggerReviewRecordSha256: unknown;
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
type TriggerView = {
  version?: unknown; kind?: unknown; repository?: unknown; prNumber?: unknown; baseSha?: unknown;
  headSha?: unknown; mergeSha?: unknown; workflowSha?: unknown; workflowPath?: unknown;
  runId?: unknown; runAttempt?: unknown; authority?: TriggerAuthorityView | null;
  inputDigests?: unknown; decisionSha256?: unknown; decisionBytesBase64?: unknown;
  decision?: { decision?: unknown } | null;
};
type ChangeObservationView = { path?: unknown; beforeBytes?: unknown; afterBytes?: unknown };
type ValidatedChange = OwnerAmendmentOwnerDecisionAmendmentChange & Readonly<{
  beforeBytes: Buffer; afterBytes: Buffer; beforeByteLength: unknown; afterByteLength: unknown;
}>;
type AmendmentRecordAuthorityView = { id?: unknown; path?: unknown; previousSha256?: unknown; newSha256?: unknown };
type AmendmentRecordChangeView = Record<string, unknown> & { path?: unknown; beforeSha256?: unknown; afterSha256?: unknown };
type AmendmentRecordView = {
  version?: unknown; kind?: unknown; triggerProfile?: unknown; repository?: unknown; baseSha?: unknown;
  headSha?: unknown; policyRevision?: unknown; authority?: AmendmentRecordAuthorityView | null;
  changes?: unknown; priorAuthoritySetDigest?: unknown; resultingAuthoritySetDigest?: unknown;
  triggeringReviewSha256?: unknown; attestationBundleSha256?: unknown; purpose?: unknown;
};
type AmendmentRecordExpectedView = {
  repository?: unknown; baseSha?: unknown; bSha?: unknown; policyRevision?: unknown;
  triggerProfile?: unknown; triggerReviewRecordSha256?: unknown; authoritySetDigest?: unknown;
  resultingAuthoritySetDigest?: unknown; authorityId?: unknown; authorityPath?: unknown; changes?: unknown;
};

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const fail: (message: string) => never = message => { throw new Error(`Owner amendment OWNER_DECISION AmendmentRecord: ${message}`); };

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
 * Build a closed AmendmentRecord for the completed-owner-decision-self-v1
 * trigger. The record binds the historical escalation by its exact ReviewRecord
 * digest without claiming it authenticates the owner's choice or identity.
 */
export function buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes,
  attestationBundleBytes, repository, baseSha, bSha, authorityId, authorityPath,
  previousAuthorityBytes, amendedAuthorityBytes, authorityChanges, priorAuthoritySetDigest,
  resultingAuthoritySetDigest, purpose }: OwnerAmendmentOwnerDecisionAmendmentRecordInput): OwnerAmendmentOwnerDecisionAmendmentBuildResult {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository) ||
      !SHA1.test((baseSha ?? '') as string) || !SHA1.test((bSha ?? '') as string) || baseSha === bSha) fail('repository, previous base, or exact B is invalid.');
  if (!Buffer.isBuffer(attestationBundleBytes) || !attestationBundleBytes.length || attestationBundleBytes.length > 65_536) {
    fail('exact trigger attestation bundle bytes are missing or oversized.');
  }
  if (!Buffer.isBuffer(previousAuthorityBytes) || !previousAuthorityBytes.length || previousAuthorityBytes.length > 262_144 ||
      !Buffer.isBuffer(amendedAuthorityBytes) || !amendedAuthorityBytes.length || amendedAuthorityBytes.length > 262_144 ||
      digest(previousAuthorityBytes) === digest(amendedAuthorityBytes)) fail('exact changed authority bytes are invalid or unchanged.');
  if (typeof authorityId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(authorityId) ||
      typeof authorityPath !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(authorityPath) ||
      authorityPath.length > 240 || authorityPath.split('/').some(part => part === '.' || part === '..')) fail('target authority identity is invalid.');
  if (typeof purpose !== 'string' || !purpose.trim() || purpose.length > 500 || !/^[\x20-\x7e]+$/.test(purpose)) fail('purpose is invalid.');

  const trigger = json(reviewRecordBytes, 'OWNER_DECISION ReviewRecord') as TriggerView;
  exact(trigger, ['version', 'kind', 'repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha',
    'workflowPath', 'runId', 'runAttempt', 'authority', 'inputDigests', 'decisionSha256', 'decisionBytesBase64', 'decision'], 'OWNER_DECISION ReviewRecord');
  if (trigger.version !== 1 || trigger.kind !== 'owner-amendment-owner-decision-review-record' ||
      trigger.repository !== repository || trigger.baseSha !== baseSha || trigger.workflowSha !== baseSha ||
      !Number.isSafeInteger(trigger.prNumber) || (trigger.prNumber as number) < 1 || !SHA1.test((trigger.headSha ?? '') as string) ||
      trigger.headSha === baseSha || trigger.headSha === bSha || !SHA1.test((trigger.mergeSha ?? '') as string) ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test((trigger.workflowPath ?? '') as string) ||
      ![trigger.runId, trigger.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
      trigger.decision?.decision !== 'OWNER_DECISION') {
    fail('trigger is not a completed protected OWNER_DECISION.');
  }
  const decisionBytes = Buffer.from((trigger.decisionBytesBase64 ?? '') as string, 'base64');
  if (!decisionBytes.length || decisionBytes.toString('base64') !== trigger.decisionBytesBase64 ||
      digest(decisionBytes) !== trigger.decisionSha256 ||
      JSON.stringify(json(decisionBytes, 'exact OWNER_DECISION bytes', 65_536)) !== JSON.stringify(trigger.decision)) {
    fail('trigger exact decision bytes and decision digest do not agree.');
  }
  const member = (trigger.authority?.members as TriggerMemberView[] | undefined)?.find((item: TriggerMemberView) => item.id === authorityId && item.path === authorityPath &&
    item.repository === repository && item.resolvedCommit === baseSha);
  if (!member || (trigger.authority as TriggerAuthorityView).authorityRevision !== baseSha || (trigger.authority as TriggerAuthorityView).selfRepository !== repository ||
      !SHA256.test((member.sha256 ?? '') as string) || member.sha256 !== digest(previousAuthorityBytes)) {
    fail('trigger Authority Set does not bind the target authority bytes at the exact previous base.');
  }
  validatePreviousMembers(trigger.authority, repository, baseSha);
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
  const record: OwnerAmendmentOwnerDecisionAmendmentRecord = Object.freeze({ version: 2, kind: 'owner-amendment-owner-decision-amendment-record',
    triggerProfile: 'completed-owner-decision-self-v1', repository, baseSha, headSha: bSha,
    policyRevision: baseSha, authority: Object.freeze({ id: authorityId, path: authorityPath,
      previousSha256: digest(previousAuthorityBytes), newSha256: digest(amendedAuthorityBytes) }),
    changes: Object.freeze(changes.map(({ path: changedPath, beforeSha256, afterSha256 }) =>
      Object.freeze({ path: changedPath, beforeSha256, afterSha256 }))),
    priorAuthoritySetDigest: computedPriorDigest, resultingAuthoritySetDigest: computedResultingDigest,
    triggeringReviewSha256: digest(reviewRecordBytes as Buffer), attestationBundleSha256: digest(attestationBundleBytes), purpose });
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
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
export function validateOwnerAmendmentOwnerDecisionAmendmentRecord(
  { bytes, expected }: OwnerAmendmentOwnerDecisionAmendmentRecordValidationInput = {},
): OwnerAmendmentOwnerDecisionAmendmentRecordResult {
  try {
    const value = json(bytes, 'AmendmentRecord', 8_192) as AmendmentRecordView;
    exact(value, ['version', 'kind', 'triggerProfile', 'repository', 'baseSha', 'headSha', 'policyRevision',
      'authority', 'changes', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest',
      'triggeringReviewSha256', 'attestationBundleSha256', 'purpose'], 'AmendmentRecord');
    exact(expected, ['repository', 'baseSha', 'bSha', 'policyRevision', 'triggerProfile', 'triggerReviewRecordSha256',
      'authoritySetDigest', 'resultingAuthoritySetDigest', 'authorityId', 'authorityPath', 'changes'], 'expected protected AmendmentRecord bindings');
    exact(value.authority, ['id', 'path', 'previousSha256', 'newSha256'], 'AmendmentRecord authority');
    if (value.version !== 2 || value.kind !== 'owner-amendment-owner-decision-amendment-record' ||
        value.triggerProfile !== 'completed-owner-decision-self-v1' || value.repository !== (expected as AmendmentRecordExpectedView).repository ||
        value.baseSha !== (expected as AmendmentRecordExpectedView).baseSha || value.headSha !== (expected as AmendmentRecordExpectedView).bSha || value.policyRevision !== (expected as AmendmentRecordExpectedView).policyRevision ||
        (expected as AmendmentRecordExpectedView).triggerProfile !== value.triggerProfile || value.triggeringReviewSha256 !== (expected as AmendmentRecordExpectedView).triggerReviewRecordSha256 ||
        !SHA256.test(((value.authority as AmendmentRecordAuthorityView).previousSha256 ?? '') as string) || !SHA256.test(((value.authority as AmendmentRecordAuthorityView).newSha256 ?? '') as string) ||
        (value.authority as AmendmentRecordAuthorityView).previousSha256 === (value.authority as AmendmentRecordAuthorityView).newSha256 || !SHA256.test((value.attestationBundleSha256 ?? '') as string) ||
        !SHA256.test((value.priorAuthoritySetDigest ?? '') as string) || !SHA256.test((value.resultingAuthoritySetDigest ?? '') as string) ||
        value.priorAuthoritySetDigest !== (expected as AmendmentRecordExpectedView).authoritySetDigest ||
        value.resultingAuthoritySetDigest !== (expected as AmendmentRecordExpectedView).resultingAuthoritySetDigest ||
        (value.authority as AmendmentRecordAuthorityView).id !== (expected as AmendmentRecordExpectedView).authorityId || (value.authority as AmendmentRecordAuthorityView).path !== (expected as AmendmentRecordExpectedView).authorityPath ||
        typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.length > 500) fail('AmendmentRecord does not bind protected OWNER_DECISION inputs.');
    if (!Array.isArray((expected as AmendmentRecordExpectedView).changes) || !Array.isArray(value.changes) ||
        JSON.stringify(value.changes) !== JSON.stringify((expected as AmendmentRecordExpectedView).changes)) {
      fail('AmendmentRecord does not bind every exact changed authority path and before/after digest.');
    }
    const target = (value.changes as AmendmentRecordChangeView[]).filter((change: AmendmentRecordChangeView) => change.path === (value.authority as AmendmentRecordAuthorityView).path);
    if (target.length !== 1 || target[0].beforeSha256 !== (value.authority as AmendmentRecordAuthorityView).previousSha256 ||
        target[0].afterSha256 !== (value.authority as AmendmentRecordAuthorityView).newSha256) {
      fail('AmendmentRecord selected target does not match its complete changed-authority list.');
    }
    const canonical = `${JSON.stringify(value)}\n`;
    if (!(bytes as Buffer).equals(Buffer.from(canonical))) fail('AmendmentRecord bytes are not canonical producer bytes.');
    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository: value.repository,
      baseSha: value.baseSha, bSha: value.headSha, policyRevision: value.policyRevision,
      triggerProfile: value.triggerProfile, triggerReviewRecordSha256: value.triggeringReviewSha256,
      priorAuthoritySetDigest: (expected as AmendmentRecordExpectedView).authoritySetDigest, resultingAuthoritySetDigest: (expected as AmendmentRecordExpectedView).resultingAuthoritySetDigest,
      authorityId: (value.authority as AmendmentRecordAuthorityView).id, authorityPath: (value.authority as AmendmentRecordAuthorityView).path,
      changes: Object.freeze((value.changes as AmendmentRecordChangeView[]).map((change: AmendmentRecordChangeView) => Object.freeze({ ...change }))),
      targetValidated: true, purpose: value.purpose });
  } catch (error) { return Object.freeze({ status: 'INCOMPLETE', reason: (error as ErrorMessageView).message }); }
}
