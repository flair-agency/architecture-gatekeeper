import { prepareLegacyAuthority, type LegacyAuthorityProvenance } from '../../../src/ci-review/legacy-ci-authority-preparer.mts';

declare const result: LegacyAuthorityProvenance;
const badPath: number = result.members[0].path;
const wrongCompletion: void = prepareLegacyAuthority({ root: 'unused' });
void [badPath, wrongCompletion];
