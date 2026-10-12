import { parseAuthorityManifest } from '../../../src/authority-set.mjs';
import { selectSingleOwnerAdditionMember } from '../../../src/owner-addition/single-authority-member.mts';

declare const manifestBytes: unknown;
declare const limits: unknown;
declare const authorityPath: unknown;

const parsed = parseAuthorityManifest(manifestBytes, limits);
const id: string = selectSingleOwnerAdditionMember(parsed, authorityPath);
void id;
