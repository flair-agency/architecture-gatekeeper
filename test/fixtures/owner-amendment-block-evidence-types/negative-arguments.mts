import { verifyOwnerAmendmentBlockEvidenceBundle, type OwnerAmendmentBlockEvidenceInput } from '../../../src/owner-amendment/owner-amendment-block-evidence-composer.mts';

declare const input: Omit<OwnerAmendmentBlockEvidenceInput, 'runGh'>;
verifyOwnerAmendmentBlockEvidenceBundle({ ...input, runGh: 'not a callback' });
