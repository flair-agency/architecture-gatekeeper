import { decodeLimits, prepareAuthoritySet } from '../../../src/prepare-authority-set.mjs';
import type { PrepareAuthoritySetInput } from '../../../src/authority-validation/prepare-authority-set.mts';

const limits = decodeLimits(Buffer.from(JSON.stringify({ maxManifestBytes: 10, maxMembers: 1, maxFileBytes: 10, maxTotalBytes: 10, maxPromptBytes: 10 })).toString('base64'));
const input: PrepareAuthoritySetInput = { selfRepository: 'owner/repo', selfRoot: '/workspace', authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out', limits };
const prepared: Promise<{ outputDir: string; provenance: unknown }> = prepareAuthoritySet(input);
void prepared;
