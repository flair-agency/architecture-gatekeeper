import { verifyOwnerAmendmentBlockEvidenceBundle, type OwnerAmendmentBlockEvidenceInput } from '../../../src/owner-amendment/owner-amendment-block-evidence-composer.mts';

declare const input: Omit<OwnerAmendmentBlockEvidenceInput, 'tagEnvelope'>;
verifyOwnerAmendmentBlockEvidenceBundle({ ...input, tagEnvelope: {
  headSha: 'unknown',
  tag: { ref: 'unknown', objectOid: 'unknown', objectBytes: 'unknown' },
  observedTagRefOid: 'unknown',
  reviewRecordBytes: 'unknown',
  amendmentRecordBytes: 'unknown',
  attestationBundleBytes: 'unknown',
} });
