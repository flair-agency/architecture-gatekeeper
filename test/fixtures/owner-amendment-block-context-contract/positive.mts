import { verifyOwnerAmendmentBlockContext } from '../../../src/owner-amendment-block-context-verifier.mjs';
import { verifyOwnerAmendmentBlockContext as verifyPhysical } from '../../../src/owner-amendment/owner-amendment-block-context-verifier.mts';
import type { OwnerAmendmentBlockContextInput, OwnerAmendmentBlockContextResult } from '../../../src/owner-amendment/owner-amendment-block-context-verifier.mts';

const input: OwnerAmendmentBlockContextInput = {
  trustedContext: { external: 'still caller supplied' },
  tagEnvelope: { external: 'still caller supplied' },
};
const result: OwnerAmendmentBlockContextResult = verifyOwnerAmendmentBlockContext(input);
const physicalResult = verifyPhysical(input);
const status: 'VERIFIED_BLOCK_AMENDMENT_CONTEXT' = result.status;
const repository: unknown = result.repository;
const tagObjectOid: unknown = result.tagObjectOid;
void [status, repository, tagObjectOid, physicalResult];
