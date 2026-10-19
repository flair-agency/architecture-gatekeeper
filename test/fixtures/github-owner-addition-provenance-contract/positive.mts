import { verifyOwnerAdditionEligibilityProvenance } from '../../../src/github-owner-addition-provenance.mjs';
import { verifyOwnerAdditionEligibilityProvenance as groupedVerifier,
  type GitHubOwnerAdditionProvenanceInput, type GitHubOwnerAdditionProvenanceResult,
  type GitHubOwnerAdditionProvenanceFetch } from '../../../src/github/github-owner-addition-provenance.mts';

const nativeFetch: GitHubOwnerAdditionProvenanceFetch = globalThis.fetch;
const synchronousObservation: GitHubOwnerAdditionProvenanceFetch = (_url, init) => {
  const headers: Record<string, string> = init.headers;
  void headers;
  return { ok: true, json: () => ({ external: 'observation' }) };
};
const input: GitHubOwnerAdditionProvenanceInput = {
  githubToken: 'fixture-token', repository: 'example/re.po', targetBranch: 'main',
  pullRequestNumber: 1, baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40),
  callerPath: '.github/workflows/review.yml', jobName: 'architecture-gate / owner-addition',
  runId: 1, attempt: 1, jobId: '2', policySha256: 'c'.repeat(64),
  expectedGatekeeperWorkflow: { path: 'example/gate/.github/workflows/review.yml', sha: 'd'.repeat(40) },
  mergeAt: '2026-10-12T00:00:00Z', fetchImpl: synchronousObservation,
};
const pending: Promise<GitHubOwnerAdditionProvenanceResult> = verifyOwnerAdditionEligibilityProvenance(input);
const groupedPending: typeof pending = groupedVerifier({ ...input, fetchImpl: nativeFetch,
  procedureDigest: undefined, eligibilityDigest: undefined, authoritySetDigest: undefined, authorityIds: undefined });
function inspect(result: GitHubOwnerAdditionProvenanceResult) {
  const status: 'verified' = result.status;
  const run: string = result.provenance.workflow.runId;
  const attempt: number = result.provenance.workflow.attempt;
  const externalProcedure: unknown = result.artifacts.procedure;
  const externalBase: unknown = result.provenance.baseSha;
  const memberIds: readonly unknown[] = result.authorityIds;
  void [status, run, attempt, externalProcedure, externalBase, memberIds];
}
void [pending, groupedPending, inspect];
