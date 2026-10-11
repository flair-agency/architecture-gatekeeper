import { verifyOwnerAdditionEligibilityProvenance } from '../../../src/github/github-owner-addition-provenance.mts';

const result = await verifyOwnerAdditionEligibilityProvenance({
  githubToken: 'token', repository: 'org/repo', targetBranch: 'main', pullRequestNumber: 7,
  baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), callerPath: '.github/workflows/check.yml',
  jobName: 'owner / owner-addition', runId: 1, attempt: 1, jobId: 2, policySha256: 'c'.repeat(64),
  expectedGatekeeperWorkflow: { path: 'workflow.yml', sha: 'd'.repeat(40) }, mergeAt: '2026-01-01T00:00:00Z',
});
const externalArtifactId: string = result.artifacts.evidenceArtifact.id;
const parsedProcedure: { repository: string } = result.artifacts.procedure;
const computedAt: number = result.completedAt;
void [externalArtifactId, parsedProcedure, computedAt];
const missingInputs = verifyOwnerAdditionEligibilityProvenance({});
void missingInputs;
const returnedSha: string = result.provenance.baseSha;
const artifactDigest: string = result.artifacts.evidenceArtifact.digest;
const gatekeeperPath: string = result.gatekeeperWorkflow.path;
void [returnedSha, artifactDigest, gatekeeperPath];
