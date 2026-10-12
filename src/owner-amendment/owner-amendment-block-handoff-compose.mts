// Compose the bounded BLOCK artifact, provenance, and exact-B handoff checks.
// This prepares bytes for a tag; it does not write a ref or decide acceptance.
import { createHash } from 'node:crypto';
import { fetchOwnerAmendmentBlockArtifact, type OwnerAmendmentArtifactFetch } from './owner-amendment-artifact.mts';
import { extractOwnerAmendmentBlockArtifactZip } from './owner-amendment-artifact-zip.mts';
import { verifyOwnerAmendmentBlockEvidence, type OwnerAmendmentGhRunner } from './owner-amendment-attestation.mts';
import { prepareOwnerAmendmentBlockHandoff } from './owner-amendment-block-handoff.mts';

const SHA = /^[a-f0-9]{40}$/;
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment BLOCK handoff: ${message}`); };
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

type ContextView = {
  repository: unknown; artifactId: unknown; runId: unknown; runAttempt: unknown;
  baseSha: unknown; headSha: unknown; aPrNumber: unknown; workflowPath: unknown;
  workflowRef: unknown; workflowSha: unknown; bSha: unknown;
};

export type ComposeOwnerAmendmentBlockHandoffInput = {
  context: unknown;
  token: unknown;
  amendmentRecordBytes?: unknown;
  buildAmendmentRecordBytes?: (recordBytes: Buffer, bundleBytes: Buffer) => unknown;
  fetchImpl?: OwnerAmendmentArtifactFetch;
  runGh?: OwnerAmendmentGhRunner;
};

export type ComposeOwnerAmendmentBlockHandoffResult =
  | Readonly<{
      status: 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE';
      bSha: unknown;
      tagMessage: string;
      reviewRecordSha256: string;
      attestationBundleSha256: string;
      amendmentRecordSha256: string;
      reason?: never;
    }>
  | Readonly<{
      status: 'INCOMPLETE';
      reason: unknown;
      bSha?: never;
      tagMessage?: never;
      reviewRecordSha256?: never;
      attestationBundleSha256?: never;
      amendmentRecordSha256?: never;
    }>;

function validateContext(context: unknown): unknown {
  const keys = ['repository', 'artifactId', 'runId', 'runAttempt', 'baseSha', 'headSha', 'aPrNumber', 'workflowPath', 'workflowRef', 'workflowSha', 'bSha'];
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      Object.keys(context).sort().join(',') !== [...keys].sort().join(',')) fail('trusted protected context is incomplete or contains unknown fields.');
  if (typeof (context as ContextView).repository !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test((context as ContextView).repository as string) ||
      ![(context as ContextView).artifactId, (context as ContextView).runId, (context as ContextView).runAttempt].every(value =>
        (typeof value === 'string' && /^[1-9]\d*$/.test(value)) || (Number.isSafeInteger(value) && (value as number) > 0)) ||
      !Number.isSafeInteger((context as ContextView).aPrNumber) || ((context as ContextView).aPrNumber as number) < 1 ||
      ![(context as ContextView).baseSha, (context as ContextView).headSha, (context as ContextView).workflowSha, (context as ContextView).bSha].every(value => SHA.test(value as string)) ||
      (context as ContextView).baseSha !== (context as ContextView).workflowSha || (context as ContextView).baseSha === (context as ContextView).headSha || (context as ContextView).bSha === (context as ContextView).baseSha ||
      typeof (context as ContextView).workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test((context as ContextView).workflowPath as string) ||
      typeof (context as ContextView).workflowRef !== 'string' || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test((context as ContextView).workflowRef as string)) {
    fail('trusted protected context has invalid values or does not bind the producer workflow to A base.');
  }
  return context;
}

function crossBindReviewRecord(recordBytes: Buffer, context: unknown): void {
  let record: unknown;
  try { record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(recordBytes)); }
  catch { fail('extracted ReviewRecord is not valid UTF-8 JSON.'); }
  const expected = {
    repository: (context as ContextView).repository,
    baseSha: (context as ContextView).baseSha,
    headSha: (context as ContextView).headSha,
    workflowSha: (context as ContextView).workflowSha,
    workflowPath: (context as ContextView).workflowPath,
    prNumber: (context as ContextView).aPrNumber,
    runId: String((context as ContextView).runId),
    runAttempt: String((context as ContextView).runAttempt),
  };
  for (const [field, value] of Object.entries(expected)) {
    if ((record as Record<string, unknown> | null)?.[field] !== value) fail(`ReviewRecord ${field} differs from trusted protected context.`);
  }
  if ((record as { kind?: unknown } | null)?.kind !== 'owner-amendment-block-review-record' ||
      (record as { decision?: { decision?: unknown } } | null)?.decision?.decision !== 'BLOCK') {
    fail('ReviewRecord is not a completed BLOCK record.');
  }
}

/** Fetch and validate one historical BLOCK and prepare its exact-B tag message. */
export async function composeOwnerAmendmentBlockHandoff({ context, token, amendmentRecordBytes,
  buildAmendmentRecordBytes, fetchImpl = fetch, runGh }: ComposeOwnerAmendmentBlockHandoffInput): Promise<ComposeOwnerAmendmentBlockHandoffResult> {
  try {
    context = validateContext(context);
    if (typeof token !== 'string' || !token) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function' || typeof runGh !== 'function') fail('fetch and attestation verifier helpers are required.');
    const hasBytes = amendmentRecordBytes !== undefined;
    const hasBuilder = buildAmendmentRecordBytes !== undefined;
    if (hasBytes === hasBuilder || (hasBytes && !Buffer.isBuffer(amendmentRecordBytes)) ||
        (hasBuilder && typeof buildAmendmentRecordBytes !== 'function')) {
      fail('provide either exact AmendmentRecord bytes or a protected AmendmentRecord builder.');
    }

    const fetched = await fetchOwnerAmendmentBlockArtifact({
      expected: { repository: (context as ContextView).repository, artifactId: (context as ContextView).artifactId,
        runId: (context as ContextView).runId, runAttempt: (context as ContextView).runAttempt,
        baseSha: (context as ContextView).baseSha, headSha: (context as ContextView).headSha }, token, fetchImpl,
    });
    if (fetched.status !== 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(fetched.reason ?? 'trusted BLOCK artifact could not be fetched.');
    const extracted = extractOwnerAmendmentBlockArtifactZip(fetched.zipBytes);
    if (extracted.status !== 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(extracted.reason ?? 'BLOCK artifact could not be safely extracted.');

    crossBindReviewRecord(extracted.reviewRecordBytes, context);
    const producerExpected = { repository: (context as ContextView).repository, workflowPath: (context as ContextView).workflowPath,
      workflowSha: (context as ContextView).workflowSha, workflowRef: (context as ContextView).workflowRef,
      runId: String((context as ContextView).runId), runAttempt: String((context as ContextView).runAttempt) };
    const provenance = verifyOwnerAmendmentBlockEvidence({ recordBytes: extracted.reviewRecordBytes,
      bundleBytes: extracted.attestationBundleBytes, expected: producerExpected, runGh });
    if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION') fail(provenance.reason ?? 'BLOCK producer provenance is unverified.');

    // The builder form lets a protected caller bind the exact verified BLOCK
    // bytes into the AmendmentRecord without fetching the artifact twice.
    if (hasBuilder) amendmentRecordBytes = buildAmendmentRecordBytes!(
      Buffer.from(extracted.reviewRecordBytes), Buffer.from(extracted.attestationBundleBytes));
    if (!Buffer.isBuffer(amendmentRecordBytes)) fail('AmendmentRecord builder did not return exact bytes.');

    const prepared = prepareOwnerAmendmentBlockHandoff({ recordBytes: extracted.reviewRecordBytes,
      bundleBytes: extracted.attestationBundleBytes, amendmentRecordBytes, expected: producerExpected,
      bSha: (context as ContextView).bSha, provenanceResult: provenance });
    if (prepared.status !== 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE') fail('BLOCK handoff preparation did not complete.');
    return Object.freeze({ status: prepared.status, bSha: prepared.bSha, tagMessage: prepared.tagMessage,
      reviewRecordSha256: digest(extracted.reviewRecordBytes), attestationBundleSha256: digest(extracted.attestationBundleBytes),
      amendmentRecordSha256: digest(amendmentRecordBytes) });
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
