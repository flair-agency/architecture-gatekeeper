import { verifyOwnerAmendmentBlockEvidenceBundle } from '../../../src/owner-amendment/owner-amendment-block-evidence-composer.mts';

declare const input: Parameters<typeof verifyOwnerAmendmentBlockEvidenceBundle>[0];
const result = verifyOwnerAmendmentBlockEvidenceBundle(input);
if (result.status === 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE') {
  const repository: string = result.repository;
  const runId: string = result.producerRunId;
  void [repository, runId];
}
input.trustedContext = {};
