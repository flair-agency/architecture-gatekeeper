import * as flat from '../../../src/multi-authority-provenance.mjs';
import * as physical from '../../../src/authority-validation/multi-authority-provenance.mts';
import type { MultiAuthorityProvenance } from '../../../src/authority-validation/multi-authority-provenance.mts';

const original: { mutable: true } = { mutable: true };
const returned = flat.validateMultiAuthorityProvenance(original);
const same: { mutable: true } = returned;
const decision = { authoritySetDigest: 'a'.repeat(64) };
const decisionResult: typeof decision = physical.validateMultiAuthorityDecision(decision, {});
const unknownInput: unknown = JSON.parse('{}');
const unknownReturned: unknown = flat.validateMultiAuthorityProvenance(unknownInput);
const provenanceManifest = 'b'.repeat(64);
const provenanceDigest = 'c'.repeat(64);
const metadataOnly = physical.multiAuthorityProvenance({
  manifestSha256: provenanceManifest, setDigest: provenanceDigest,
  members: [{ id: 'architecture-contract', repository: 'org/repo', resolvedCommit: 'a'.repeat(40),
    path: 'docs/architecture.md', byteLength: 1, sha256: 'd'.repeat(64) }],
}, 'org/repo', 'a'.repeat(40));
const provenance: MultiAuthorityProvenance = {
  version: 2, selfRepository: 'org/repo', authorityRevision: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), setDigest: 'c'.repeat(64),
  members: [{ id: 'architecture-contract', repository: 'org/repo', resolvedCommit: 'a'.repeat(40),
    path: 'docs/architecture.md', byteLength: 1, sha256: 'd'.repeat(64) }],
};
const created: MultiAuthorityProvenance = physical.multiAuthorityProvenance({
  manifestSha256: provenance.manifestSha256, setDigest: provenance.setDigest,
  members: [{ ...provenance.members[0], content: Buffer.from('x') }],
}, 'org/repo', 'a'.repeat(40));
void [same, decisionResult, unknownReturned, metadataOnly, created];
