import { multiAuthorityProvenance, validateMultiAuthorityProvenance } from '../../../src/multi-authority-provenance.mjs';

const missingRepository = multiAuthorityProvenance({ manifestSha256: 'a'.repeat(64), setDigest: 'b'.repeat(64), members: [] }, 'org/repo');
const numericRepository = multiAuthorityProvenance({ manifestSha256: 'a'.repeat(64), setDigest: 'b'.repeat(64), members: [] }, 42, 'a'.repeat(40));
const invalidConstructorMember = multiAuthorityProvenance({ manifestSha256: 'a'.repeat(64), setDigest: 'b'.repeat(64),
  members: [{ id: 'id', repository: 'org/repo', resolvedCommit: 'a'.repeat(40), path: 'docs/a.md', byteLength: '2', sha256: 'c'.repeat(64), content: Buffer.from('x') }] }, 'org/repo', 'a'.repeat(40));
const claimedAcceptance: { accepted: true } = validateMultiAuthorityProvenance({});
const unvalidatedInput: unknown = JSON.parse('{}');
const claimedProvenance: import('../../../src/authority-validation/multi-authority-provenance.mts').MultiAuthorityProvenance = unvalidatedInput;
void [missingRepository, numericRepository, invalidConstructorMember, claimedAcceptance, claimedProvenance];
