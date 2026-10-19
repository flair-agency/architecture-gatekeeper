import { prepareLegacyAuthority, type LegacyAuthorityPreparationInput, type LegacyAuthorityProvenance } from '../../../src/ci-review/legacy-ci-authority-preparer.mts';
import { prepareLegacyAuthority as flatPrepare } from '../../../src/prepare-legacy-ci-authority.mjs';

declare const input: LegacyAuthorityPreparationInput;
const externalRoot: unknown = input.root;
const result: LegacyAuthorityProvenance = prepareLegacyAuthority(input);
const flatResult: LegacyAuthorityProvenance = flatPrepare(input);
const selectedPath: string = result.members[0].path;
void [externalRoot, flatResult, selectedPath];
