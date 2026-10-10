import { validateOwnerDecisionAdditionG0Procedure } from '../../../src/owner-decision-addition.mjs';
import type { OwnerDecisionAdditionProcedureInput } from '../../../src/owner-addition/owner-decision-addition.mts';
import { evaluateOwnerAdditionAdoption } from '../../../src/owner-addition-adoption.mjs';
import type { OwnerAdditionAdoptionInput } from '../../../src/owner-addition/owner-addition-adoption.mts';

const incomplete: OwnerDecisionAdditionProcedureInput = {
  policy: { version: 1, repository: 'org/repo', revision: 'a'.repeat(40), ownerAddition: { grade: 'G0', authorityPath: 'docs/architecture.md' } },
  current: { repository: 'org/repo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), policyRevision: 'a'.repeat(40),
    baseAuthority: { id: 'architecture-contract', path: 'docs/architecture.md', sha256: 'c'.repeat(64) },
    headAuthority: { id: 'architecture-contract', path: 'docs/architecture.md', sha256: 'd'.repeat(64) },
    changedFiles: [{ path: 'docs/architecture.md', status: 'modified' }], tagRefOid: 'e'.repeat(40) },
};
const result = validateOwnerDecisionAdditionG0Procedure(incomplete);
const repository: string = result.repository;
const acceptedGrade: 'VERIFIED' = result.grade;
const adoptionInput: OwnerAdditionAdoptionInput = {
  candidate: { repository: 'org/repo', targetBranch: 'main', pullRequest: { number: 1 }, baseSha: 'a'.repeat(40),
    bSha: 'b'.repeat(40), bTree: 'c'.repeat(40), authorityDigest: 'd'.repeat(64) },
  procedure: {}, ordinaryDecision: {}, authoritySet: {}, eligibility: {}, eligibilityEvidence: null, merge: null, targetReadback: null,
};
const adoption = evaluateOwnerAdditionAdoption(adoptionInput);
const authorized: 'owner_authorized' = adoption.principalAuthentication;
const canonicalAdopted: 'valid' = adoption.canonical;
void [incomplete, repository, acceptedGrade, authorized, canonicalAdopted];
const eligibilityState: 'incomplete' | 'eligible' | 'ineligible' = adoption.eligibility;
void eligibilityState;
