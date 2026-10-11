import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from '../authority-set.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true });
const SHA1 = /^[a-f0-9]{40}$/; const SHA256 = /^[a-f0-9]{64}$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment OWNER_DECISION context: ${message}`); };

type ContextAuthorityView = { id: unknown; path: unknown; previousSha256: unknown; newSha256: unknown };
type ContextPolicyView = { grade: unknown; scope: unknown; triggerProfile: unknown; authorities: unknown };
type ContextChangeView = { path: unknown; beforeSha256: unknown; afterSha256: unknown };
type TrustedContextView = { repository: unknown; baseSha: unknown; bSha: unknown; policyRevision: unknown;
  policy: ContextPolicyView; authority: ContextAuthorityView; changes: unknown; priorAuthoritySetDigest: unknown;
  resultingAuthoritySetDigest: unknown };
type TriggerMemberView = { id: unknown; repository: unknown; resolvedCommit: unknown; path: unknown;
  byteLength: unknown; sha256: unknown };
type TriggerAuthorityView = { selfRepository: unknown; authorityRevision: unknown; setDigest: unknown; members: TriggerMemberView[] };
type TriggerDecisionView = { decision: unknown; authorityIds: unknown };
type TriggerView = { version: unknown; kind: unknown; repository: unknown; prNumber: unknown; baseSha: unknown;
  headSha: unknown; mergeSha: unknown; workflowSha: unknown; workflowPath: unknown; runId: unknown; runAttempt: unknown;
  authority: TriggerAuthorityView; inputDigests: unknown; decisionSha256: unknown; decisionBytesBase64: unknown;
  decision: TriggerDecisionView };
type TagObjectView = { objectOid: unknown };
type TagEnvelopeView = { headSha: unknown; tag: TagObjectView; tagRef: unknown; observedTagRefOid: unknown;
  reviewRecordBytes: unknown; attestationBundleBytes: unknown; amendmentRecordBytes: unknown; triggerProfile: unknown };
type ParsedAmendmentAuthorityView = { id: unknown; path: unknown; previousSha256: unknown; newSha256: unknown };
type AmendmentView = { version: unknown; kind: unknown; triggerProfile: unknown; repository: unknown; baseSha: unknown;
  headSha: unknown; policyRevision: unknown; authority: ParsedAmendmentAuthorityView; changes: unknown;
  priorAuthoritySetDigest: unknown; resultingAuthoritySetDigest: unknown; triggeringReviewSha256: unknown;
  attestationBundleSha256: unknown; purpose: unknown };

export type OwnerAmendmentOwnerDecisionContextInput = {
  tagEnvelope?: unknown;
  trustedContext?: unknown;
  [key: string]: unknown;
};
type VerifiedOwnerDecisionContext = Readonly<{
  status: 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT';
  repository: unknown; baseSha: unknown; bSha: unknown; policyRevision: unknown; triggerProfile: unknown;
  reviewRecordSha256: string; attestationBundleSha256: string; amendmentRecordSha256: string; tagObjectOid: unknown;
  changes: readonly Readonly<Record<string, unknown>>[]; priorAuthoritySetDigest: unknown;
  resultingAuthoritySetDigest: unknown; authorityId: unknown; authorityPath: unknown;
  previousAuthoritySha256: unknown; proposedAuthoritySha256: unknown; purpose: unknown;
  reason?: never;
}>;
type IncompleteOwnerDecisionContext = Readonly<{
  status: 'INCOMPLETE'; reason: unknown;
  repository?: never; baseSha?: never; bSha?: never; policyRevision?: never; triggerProfile?: never;
  reviewRecordSha256?: never; attestationBundleSha256?: never; amendmentRecordSha256?: never; tagObjectOid?: never;
  changes?: never; priorAuthoritySetDigest?: never; resultingAuthoritySetDigest?: never;
  authorityId?: never; authorityPath?: never; previousAuthoritySha256?: never; proposedAuthoritySha256?: never;
  purpose?: never;
}>;
export type OwnerAmendmentOwnerDecisionContextResult = VerifiedOwnerDecisionContext | IncompleteOwnerDecisionContext;

function exact(value: unknown, keys: readonly string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(`${label} has missing or unknown fields.`);
}
function parse(bytes: unknown, label: string, max: number): { text: string; value: unknown } {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > max) fail(`${label} bytes are missing or oversized.`);
  let text: string, value: unknown;
  try { text = decoder.decode(bytes); rejectDuplicateJsonKeys(text, label); value = JSON.parse(text) as unknown; }
  catch (error: unknown) { fail(`${label} is invalid: ${(error as { message: unknown }).message}`); }
  return { text, value };
}

/** Verify the v3 OWNER_DECISION tag payload against exact protected Git state. */
export function verifyOwnerAmendmentOwnerDecisionContext({ tagEnvelope, trustedContext }:
  OwnerAmendmentOwnerDecisionContextInput = {}): OwnerAmendmentOwnerDecisionContextResult {
  try {
    exact(trustedContext, ['repository', 'baseSha', 'bSha', 'policyRevision', 'policy', 'authority',
      'changes', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest'], 'trusted context');
    exact((trustedContext as TrustedContextView).policy, ['grade', 'scope', 'triggerProfile', 'authorities'], 'previous policy selection');
    if ((trustedContext as TrustedContextView).policy.grade !== 'G0' || (trustedContext as TrustedContextView).policy.scope !== 'authority-only' ||
        (trustedContext as TrustedContextView).policy.triggerProfile !== 'completed-owner-decision-self-v1' ||
        (trustedContext as TrustedContextView).policyRevision !== (trustedContext as TrustedContextView).baseSha || !SHA1.test(((trustedContext as TrustedContextView).baseSha ?? '') as string) ||
        !SHA1.test(((trustedContext as TrustedContextView).bSha ?? '') as string) || (trustedContext as TrustedContextView).baseSha === (trustedContext as TrustedContextView).bSha) fail('protected base does not select the exact OWNER_DECISION profile.');
    if (!Array.isArray((trustedContext as TrustedContextView).changes) || !(trustedContext as { changes: unknown[] }).changes.length || (trustedContext as { changes: unknown[] }).changes.length > 32 ||
        !SHA256.test(((trustedContext as TrustedContextView).priorAuthoritySetDigest ?? '') as string) ||
        !SHA256.test(((trustedContext as TrustedContextView).resultingAuthoritySetDigest ?? '') as string)) fail('trusted complete change/set bindings are invalid.');
    let lastPath = '';
    for (const change of (trustedContext as TrustedContextView).changes as unknown[]) {
      exact(change, ['path','beforeSha256','afterSha256'], 'trusted authority change');
      if (!PATH.test(((change as ContextChangeView).path ?? '') as string) || ((change as ContextChangeView).path as string).length > 240 || ((change as ContextChangeView).path as string).split('/').some(part => part === '.' || part === '..') ||
          (lastPath && lastPath >= ((change as ContextChangeView).path as string)) || !SHA256.test(((change as ContextChangeView).beforeSha256 ?? '') as string) ||
          !SHA256.test(((change as ContextChangeView).afterSha256 ?? '') as string) || (change as ContextChangeView).beforeSha256 === (change as ContextChangeView).afterSha256) {
        fail('trusted complete authority changes are malformed or unsorted.');
      }
      lastPath = (change as ContextChangeView).path as string;
    }
    const targetChanges = ((trustedContext as TrustedContextView).changes as ContextChangeView[]).filter(change => change.path === (trustedContext as TrustedContextView).authority.path);
    if (targetChanges.length !== 1 || targetChanges[0].beforeSha256 !== (trustedContext as TrustedContextView).authority.previousSha256 ||
        targetChanges[0].afterSha256 !== (trustedContext as TrustedContextView).authority.newSha256) fail('trusted change list omits or mismatches the selected target.');
    exact(tagEnvelope, ['headSha', 'tag', 'tagRef', 'observedTagRefOid', 'reviewRecordBytes',
      'attestationBundleBytes', 'amendmentRecordBytes', 'triggerProfile'], 'tag envelope');
    if ((tagEnvelope as TagEnvelopeView).headSha !== (trustedContext as TrustedContextView).bSha || (tagEnvelope as TagEnvelopeView).triggerProfile !== (trustedContext as TrustedContextView).policy.triggerProfile ||
        (tagEnvelope as TagEnvelopeView).tagRef !== `refs/tags/architecture-gatekeeper/amendments/${(trustedContext as TrustedContextView).bSha}` ||
        (tagEnvelope as TagEnvelopeView).observedTagRefOid !== (tagEnvelope as TagEnvelopeView).tag?.objectOid || !SHA1.test(((tagEnvelope as TagEnvelopeView).observedTagRefOid ?? '') as string)) fail('tag does not bind protected exact B/profile/ref.');
    const { value: trigger } = parse((tagEnvelope as TagEnvelopeView).reviewRecordBytes, 'OWNER_DECISION ReviewRecord', 131_072);
    exact(trigger, ['version','kind','repository','prNumber','baseSha','headSha','mergeSha','workflowSha','workflowPath','runId','runAttempt',
      'authority','inputDigests','decisionSha256','decisionBytesBase64','decision'], 'trigger ReviewRecord');
    if ((trigger as TriggerView).version !== 1 || (trigger as TriggerView).kind !== 'owner-amendment-owner-decision-review-record' ||
        (trigger as TriggerView).repository !== (trustedContext as TrustedContextView).repository || (trigger as TriggerView).baseSha !== (trustedContext as TrustedContextView).baseSha || (trigger as TriggerView).workflowSha !== (trustedContext as TrustedContextView).baseSha ||
        (trigger as TriggerView).headSha === (trustedContext as TrustedContextView).bSha || !SHA1.test(((trigger as TriggerView).headSha ?? '') as string) || !SHA1.test(((trigger as TriggerView).mergeSha ?? '') as string) ||
        !Number.isSafeInteger((trigger as TriggerView).prNumber) || ((trigger as TriggerView).prNumber as number) < 1 || (trigger as TriggerView).decision?.decision !== 'OWNER_DECISION' ||
        ![(trigger as TriggerView).runId, (trigger as TriggerView).runAttempt].every(x => typeof x === 'string' && /^[1-9]\d*$/.test(x))) fail('trigger is not exact completed OWNER_DECISION evidence.');
    if (typeof (trigger as TriggerView).decisionBytesBase64 !== 'string') fail('trigger decision bytes are absent.');
    const decisionBytes = Buffer.from((trigger as TriggerView).decisionBytesBase64 as string, 'base64');
    const { value: exactDecision } = parse(decisionBytes, 'exact OWNER_DECISION', 65_536);
    if (decisionBytes.toString('base64') !== (trigger as TriggerView).decisionBytesBase64 || hash(decisionBytes) !== (trigger as TriggerView).decisionSha256 ||
        JSON.stringify(exactDecision) !== JSON.stringify((trigger as TriggerView).decision)) fail('trigger decision digest/content differs from exact bytes.');
    const member = (trigger as TriggerView).authority?.members?.find(item => item.id === (trustedContext as TrustedContextView).authority.id &&
      item.path === (trustedContext as TrustedContextView).authority.path && item.repository === (trustedContext as TrustedContextView).repository && item.resolvedCommit === (trustedContext as TrustedContextView).baseSha);
    if (!member || member.sha256 !== (trustedContext as TrustedContextView).authority.previousSha256 ||
        (trigger as TriggerView).authority.authorityRevision !== (trustedContext as TrustedContextView).baseSha || (trigger as TriggerView).authority.selfRepository !== (trustedContext as TrustedContextView).repository) fail('trigger does not bind target authority at exact previous base.');
    if (!Array.isArray((trigger as TriggerView).authority.members) || (trigger as TriggerView).authority.members.length < 1 || (trigger as TriggerView).authority.members.length > 32) {
      fail('trigger does not carry the complete previous Authority Set.');
    }
    const previousDescriptors = (trigger as TriggerView).authority.members.map(item => ({ id: item.id, repository: item.repository,
      resolvedCommit: item.resolvedCommit, path: item.path, byteLength: item.byteLength, sha256: item.sha256 }));
    const previousSetDigest = hash(Buffer.from(JSON.stringify(previousDescriptors), 'utf8'));
    if (previousSetDigest !== (trigger as TriggerView).authority.setDigest || previousSetDigest !== (trustedContext as TrustedContextView).priorAuthoritySetDigest) {
      fail('trigger and protected Git context do not bind the same complete previous Authority Set.');
    }
    for (const change of (trustedContext as TrustedContextView).changes as unknown[]) {
      const beforeMember = previousDescriptors.find(item => item.repository === (trustedContext as TrustedContextView).repository &&
        item.resolvedCommit === (trustedContext as TrustedContextView).baseSha && item.path === (change as ContextChangeView).path);
      if (!beforeMember || beforeMember.sha256 !== (change as ContextChangeView).beforeSha256) {
        fail(`trigger does not bind previous Authority Set bytes for changed path ${(change as ContextChangeView).path}.`);
      }
    }
    const reviewDigest = hash((tagEnvelope as TagEnvelopeView).reviewRecordBytes as Buffer); const bundleDigest = hash((tagEnvelope as TagEnvelopeView).attestationBundleBytes as Buffer);
    const { text: amendmentText, value: amendment } = parse((tagEnvelope as TagEnvelopeView).amendmentRecordBytes, 'OWNER_DECISION AmendmentRecord', 8_192);
    exact(amendment, ['version','kind','triggerProfile','repository','baseSha','headSha','policyRevision','authority',
      'changes','priorAuthoritySetDigest','resultingAuthoritySetDigest',
      'triggeringReviewSha256','attestationBundleSha256','purpose'], 'AmendmentRecord');
    exact((amendment as AmendmentView).authority, ['id','path','previousSha256','newSha256'], 'AmendmentRecord authority');
    if (amendmentText !== `${JSON.stringify(amendment)}\n` || (amendment as AmendmentView).version !== 2 ||
        (amendment as AmendmentView).kind !== 'owner-amendment-owner-decision-amendment-record' || (amendment as AmendmentView).triggerProfile !== (trustedContext as TrustedContextView).policy.triggerProfile ||
        (amendment as AmendmentView).repository !== (trustedContext as TrustedContextView).repository || (amendment as AmendmentView).baseSha !== (trustedContext as TrustedContextView).baseSha ||
        (amendment as AmendmentView).headSha !== (trustedContext as TrustedContextView).bSha || (amendment as AmendmentView).policyRevision !== (trustedContext as TrustedContextView).policyRevision ||
        (amendment as AmendmentView).authority.id !== (trustedContext as TrustedContextView).authority.id || (amendment as AmendmentView).authority.path !== (trustedContext as TrustedContextView).authority.path ||
        (amendment as AmendmentView).authority.previousSha256 !== (trustedContext as TrustedContextView).authority.previousSha256 || (amendment as AmendmentView).authority.newSha256 !== (trustedContext as TrustedContextView).authority.newSha256 ||
        !Array.isArray((amendment as AmendmentView).changes) || JSON.stringify((amendment as AmendmentView).changes) !== JSON.stringify((trustedContext as TrustedContextView).changes) ||
        (amendment as AmendmentView).priorAuthoritySetDigest !== (trustedContext as TrustedContextView).priorAuthoritySetDigest ||
        (amendment as AmendmentView).resultingAuthoritySetDigest !== (trustedContext as TrustedContextView).resultingAuthoritySetDigest ||
        (amendment as AmendmentView).triggeringReviewSha256 !== reviewDigest ||
        (amendment as AmendmentView).attestationBundleSha256 !== bundleDigest || typeof (amendment as AmendmentView).purpose !== 'string' || !((amendment as AmendmentView).purpose as string).trim() || ((amendment as AmendmentView).purpose as string).length > 500) {
      fail('AmendmentRecord does not bind exact OWNER_DECISION, B and previous authority bytes.');
    }
    return Object.freeze({ status: 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT', repository: (trustedContext as TrustedContextView).repository,
      baseSha: (trustedContext as TrustedContextView).baseSha, bSha: (trustedContext as TrustedContextView).bSha, policyRevision: (trustedContext as TrustedContextView).policyRevision,
      triggerProfile: (trustedContext as TrustedContextView).policy.triggerProfile,
      reviewRecordSha256: reviewDigest, attestationBundleSha256: bundleDigest,
      amendmentRecordSha256: hash((tagEnvelope as TagEnvelopeView).amendmentRecordBytes as Buffer), tagObjectOid: (tagEnvelope as TagEnvelopeView).tag.objectOid,
      changes: Object.freeze(((amendment as AmendmentView).changes as unknown[]).map(change => Object.freeze({ ...(change as Record<string, unknown>) }))),
      priorAuthoritySetDigest: (amendment as AmendmentView).priorAuthoritySetDigest,
      resultingAuthoritySetDigest: (amendment as AmendmentView).resultingAuthoritySetDigest,
      authorityId: (amendment as AmendmentView).authority.id, authorityPath: (amendment as AmendmentView).authority.path,
      previousAuthoritySha256: (amendment as AmendmentView).authority.previousSha256, proposedAuthoritySha256: (amendment as AmendmentView).authority.newSha256,
      purpose: (amendment as AmendmentView).purpose });
  } catch (error: unknown) { return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message }); }
}
