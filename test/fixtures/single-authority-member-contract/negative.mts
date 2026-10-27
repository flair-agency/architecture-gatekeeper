import { parseAuthorityManifest } from '../../../src/authority-set.mts';
import { selectSingleOwnerAdditionMember } from '../../../src/owner-addition/single-authority-member.mts';

declare const manifestBytes: unknown;
declare const limits: unknown;
declare const authorityPath: unknown;
const parsed = parseAuthorityManifest(manifestBytes, limits);

// @ts-expect-error The helper requires the parsed manifest shape.
selectSingleOwnerAdditionMember(manifestBytes, authorityPath);
// @ts-expect-error The selected member ID is a string established by parsing.
const wrongId: number = selectSingleOwnerAdditionMember(parsed, authorityPath);
// @ts-expect-error The grouped helper requires both values.
selectSingleOwnerAdditionMember(parsed);
void wrongId;
