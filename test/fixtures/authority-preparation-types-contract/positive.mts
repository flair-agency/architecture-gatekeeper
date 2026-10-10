import { decodeLimits, prepareAuthoritySet } from '../../../src/prepare-authority-set.mjs';
import type { PrepareAuthoritySetInput } from '../../../src/authority-validation/prepare-authority-set.mts';

const limits = decodeLimits(Buffer.from(JSON.stringify({ maxManifestBytes: 10, maxMembers: 1, maxFileBytes: 10, maxTotalBytes: 10, maxPromptBytes: 10 })).toString('base64'));
const input: PrepareAuthoritySetInput = { selfRepository: 'owner/repo', selfRoot: '/workspace', authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out', limits };
const prepared: Promise<{ outputDir: string; provenance: unknown }> = prepareAuthoritySet(input);
const bufferManifest: PrepareAuthoritySetInput = { ...input, manifestBytes: Buffer.from('{"version":1,"authorities":[]}') };
const stringManifest: PrepareAuthoritySetInput = { ...input, manifestBytes: JSON.stringify({ version: 1, authorities: [] }) };
const preparedFromBufferManifest = prepareAuthoritySet(bufferManifest);
const preparedFromStringManifest = prepareAuthoritySet(stringManifest);
void prepared;
void preparedFromBufferManifest;
void preparedFromStringManifest;
