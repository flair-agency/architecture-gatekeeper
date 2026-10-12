import * as flat from '../../../src/owner-decision-addition.mjs';
import * as physical from '../../../src/owner-addition/owner-decision-addition.mts';
import type { OwnerDecisionAdditionProcedureInput, OwnerDecisionAdditionProcedureResult } from '../../../src/owner-addition/owner-decision-addition.mts';
import { evaluateOwnerAdditionAdoption } from '../../../src/owner-addition-adoption.mjs';
import type { OwnerAdditionAdoptionInput, OwnerAdditionAdoptionResult } from '../../../src/owner-addition/owner-addition-adoption.mts';

const input: OwnerDecisionAdditionProcedureInput = {
  policy: { version: 1, repository: 'org/repo', revision: 'a'.repeat(40), ownerAddition: { grade: 'G0', authorityPath: 'docs/architecture.md' } },
  current: { repository: 'org/repo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), policyRevision: 'a'.repeat(40),
    baseAuthority: { id: 'architecture-contract', path: 'docs/architecture.md', sha256: 'c'.repeat(64) },
    headAuthority: { id: 'architecture-contract', path: 'docs/architecture.md', sha256: 'd'.repeat(64) },
    changedFiles: [{ path: 'docs/architecture.md', status: 'modified' }], tagRefOid: 'e'.repeat(40) },
  tag: { ref: `refs/tags/architecture-owner-addition/${'b'.repeat(40)}`, objectOid: 'e'.repeat(40), objectBytes: Buffer.from('tag') },
};
const procedure: OwnerDecisionAdditionProcedureResult = flat.validateOwnerDecisionAdditionG0Procedure(input);
const physicalDigest: string = physical.digestOwnerDecisionAddition({ version: 1 });
const principalState: 'not_verified' = procedure.principalAuthentication;
const semanticState: 'requires_separate_protected_review' = procedure.semanticEligibility;
const unknownRepository: unknown = procedure.repository;
const adoptionInput: OwnerAdditionAdoptionInput = {
  candidate: { repository: 'org/repo', targetBranch: 'main', pullRequest: { number: 1 }, baseSha: 'a'.repeat(40),
    bSha: 'b'.repeat(40), bTree: 'c'.repeat(40), authorityDigest: 'd'.repeat(64) },
  procedure: {}, ordinaryDecision: {}, authoritySet: {}, eligibility: {}, eligibilityEvidence: null, merge: null, targetReadback: null,
};
const adoption: OwnerAdditionAdoptionResult = evaluateOwnerAdditionAdoption(adoptionInput);
const eligibilityState: unknown = adoption.eligibility;
const adoptionState: 'pending' | 'incomplete' | 'invalid' | 'valid' = adoption.adoption;
const canonicalState: 'pending' | 'verified' | 'invalid' = adoption.canonical;
void [physicalDigest, principalState, semanticState, unknownRepository, eligibilityState, adoptionState, canonicalState];

