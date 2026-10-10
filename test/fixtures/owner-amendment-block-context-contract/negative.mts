import { verifyOwnerAmendmentBlockContext } from '../../../src/owner-amendment-block-context-verifier.mjs';
import { verifyOwnerAmendmentBlockContext as verifyPhysical } from '../../../src/owner-amendment/owner-amendment-block-context-verifier.mts';

verifyOwnerAmendmentBlockContext({ trustedContext: {}, tagEnvelope: {} });
verifyOwnerAmendmentBlockContext({ trustedContext: {}, tagEnvelope: {} }).repository satisfies number;
verifyPhysical({ trustedContext: {}, tagEnvelope: {} }).tagObjectOid satisfies string;
const wrongInput = verifyPhysical({ trustedContext: {}, tagEnvelope: {} }, 'extra');
void wrongInput;
