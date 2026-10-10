import { verifyOwnerAmendmentBlockContext } from '../../../src/owner-amendment-block-context-verifier.mjs';
import { verifyOwnerAmendmentBlockContext as verifyPhysical } from '../../../src/owner-amendment/owner-amendment-block-context-verifier.mts';

const tagEnvelope = { headSha: 'unknown', tag: 'unknown', observedTagRefOid: 'unknown',
  reviewRecordBytes: 'unknown', amendmentRecordBytes: 'unknown', attestationBundleBytes: 'unknown' };
verifyOwnerAmendmentBlockContext({ trustedContext: {}, tagEnvelope });
verifyOwnerAmendmentBlockContext({ trustedContext: {}, tagEnvelope: { ...tagEnvelope, tagRef: 'unknown' } }).repository satisfies number;
verifyPhysical({ trustedContext: {}, tagEnvelope: { ...tagEnvelope, tagRef: 'unknown' } }).tagObjectOid satisfies string;
const wrongInput = verifyPhysical({ trustedContext: {}, tagEnvelope: { ...tagEnvelope, tagRef: 'unknown' } }, 'extra');
void wrongInput;
