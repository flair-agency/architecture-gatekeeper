import { verifyOwnerAmendmentBlockEvidenceBundle, type OwnerAmendmentBlockEvidenceInput } from '../../../src/owner-amendment/owner-amendment-block-evidence-composer.mts';
import { verifyOwnerAmendmentBlockEvidenceBundle as verifyThroughFlatFacade } from '../../../src/owner-amendment-block-evidence-composer.mjs';

declare const completeInput: OwnerAmendmentBlockEvidenceInput;
const input = {
  trustedContext: { repository: 'owner/repo', baseSha: 'unknown', bSha: 'unknown',
    policyRevision: 'unknown', policy: {}, authority: {} },
  producerContext: { repository: 'owner/repo', workflowPath: 'unknown', workflowSha: 'unknown',
    workflowRef: 'unknown', runId: 'unknown', runAttempt: 'unknown' },
  tagEnvelope: { headSha: 'unknown', tag: { ref: 'unknown', objectOid: 'unknown', objectBytes: 'unknown' },
    tagRef: 'unknown', observedTagRefOid: 'unknown', reviewRecordBytes: 'unknown', amendmentRecordBytes: 'unknown',
    attestationBundleBytes: 'unknown' },
  runGh: () => Promise.resolve('malformed output is still handled by runtime'),
} satisfies Parameters<typeof verifyOwnerAmendmentBlockEvidenceBundle>[0];
const result = verifyOwnerAmendmentBlockEvidenceBundle(input);
const facadeResult = verifyThroughFlatFacade({
  trustedContext: completeInput.trustedContext,
  producerContext: completeInput.producerContext,
  tagEnvelope: {
    headSha: completeInput.tagEnvelope.headSha,
    tag: completeInput.tagEnvelope.tag,
    tagRef: completeInput.tagEnvelope.tagRef,
    observedTagRefOid: completeInput.tagEnvelope.observedTagRefOid,
    reviewRecordBytes: completeInput.tagEnvelope.reviewRecordBytes,
    amendmentRecordBytes: completeInput.tagEnvelope.amendmentRecordBytes,
    attestationBundleBytes: completeInput.tagEnvelope.attestationBundleBytes,
  },
  runGh: completeInput.runGh,
});
void facadeResult;

if (result.status === 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE') {
  const digest: string = result.reviewRecordSha256;
  const descriptiveContextValue: unknown = result.repository;
  const rerereadProducerId: unknown = result.producerRunId;
  void [digest, descriptiveContextValue, rerereadProducerId];
} else {
  const reason: unknown = result.reason;
  void reason;
}
