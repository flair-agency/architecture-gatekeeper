import { verifyOwnerAmendmentBlockEvidenceBundle } from '../../../src/owner-amendment/owner-amendment-block-evidence-composer.mts';
import { verifyOwnerAmendmentBlockEvidenceBundle as verifyThroughFlatFacade } from '../../../src/owner-amendment-block-evidence-composer.mjs';

const input = {
  trustedContext: { repository: 'owner/repo', baseSha: 'unknown', bSha: 'unknown',
    policyRevision: 'unknown', policy: {}, authority: {} },
  producerContext: { repository: 'owner/repo', workflowPath: 'unknown', workflowSha: 'unknown',
    workflowRef: 'unknown', runId: 'unknown', runAttempt: 'unknown' },
  tagEnvelope: { reviewRecordBytes: 'unknown', attestationBundleBytes: 'unknown' },
  runGh: () => Promise.resolve('malformed output is still handled by runtime'),
} satisfies Parameters<typeof verifyOwnerAmendmentBlockEvidenceBundle>[0];
const result = verifyOwnerAmendmentBlockEvidenceBundle(input);
const facadeResult = verifyThroughFlatFacade(input);
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
