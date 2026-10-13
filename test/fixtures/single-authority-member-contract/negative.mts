import { parseAuthorityManifest } from '../../../src/authority-set.mjs';
import { selectSingleOwnerAdditionMember } from '../../../src/owner-addition/single-authority-member.mts';

declare const manifestBytes: unknown;
declare const limits: unknown;
declare const authorityPath: unknown;
const parsed = parseAuthorityManifest(manifestBytes, limits);

// The helper requires the parsed manifest shape.
selectSingleOwnerAdditionMember(manifestBytes, authorityPath);
// The selected member ID is a string established by parsing.
const wrongId: number = selectSingleOwnerAdditionMember(parsed, authorityPath);
// The grouped helper requires both values.
selectSingleOwnerAdditionMember(parsed);
void wrongId;
