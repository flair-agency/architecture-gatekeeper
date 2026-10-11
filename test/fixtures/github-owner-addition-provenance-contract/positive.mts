import {
  verifyOwnerAdditionEligibilityProvenance,
  type OwnerAdditionEligibilityProvenanceResult,
  type VerifyOwnerAdditionEligibilityProvenanceInput,
} from '../../../src/github/github-owner-addition-provenance.mts';
import { verifyOwnerAdditionEligibilityProvenance as verifyFlat } from '../../../src/github-owner-addition-provenance.mjs';

const input: VerifyOwnerAdditionEligibilityProvenanceInput = {
  githubToken: 'token', repository: 'org/repo', targetBranch: 'main', pullRequestNumber: 7,
  baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), callerPath: '.github/workflows/check.yml',
  jobName: 'owner / owner-addition', runId: 1, attempt: 1, jobId: 2, policySha256: 'c'.repeat(64),
  expectedGatekeeperWorkflow: { path: 'org/repo/.github/workflows/gate.yml', sha: 'd'.repeat(40) }, mergeAt: '2026-01-01T00:00:00Z',
};

const nativeFetch: VerifyOwnerAdditionEligibilityProvenanceInput['fetchImpl'] = globalThis.fetch;
const partialResponseFetch = (url: string, init: { headers: Record<string, string>; redirect: 'follow' }) => {
  void url;
  void init;
  return {
    ok: true,
    status: 200,
    json: () => ({}),
    arrayBuffer: () => new ArrayBuffer(1),
    headers: { get: (_name: string) => null },
  };
};
class ImmediateResponse<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}
const thenableFetch = (_url: string, _init: { headers: Record<string, string>; redirect: 'follow' }) => new ImmediateResponse({ ok: true, status: 200, json: () => ({}), arrayBuffer: () => new ArrayBuffer(1) });
const result: Promise<OwnerAdditionEligibilityProvenanceResult> = verifyOwnerAdditionEligibilityProvenance(input);
const withNativeFetch = verifyOwnerAdditionEligibilityProvenance({ ...input, fetchImpl: nativeFetch });
const withNarrowFetch = verifyOwnerAdditionEligibilityProvenance({ ...input, fetchImpl: partialResponseFetch });
const withThenableFetch = verifyOwnerAdditionEligibilityProvenance({ ...input, fetchImpl: thenableFetch });
const throughFlatFacade = verifyFlat(input);

async function observations(): Promise<void> {
  const verified = await result;
  const id: unknown = verified.artifacts.evidenceArtifact.id;
  const rawDecision: unknown = verified.artifacts.ordinaryDecision;
  const recordedDigest: unknown = verified.provenance.artifactBinding;
  const authorityId: unknown = verified.authorityIds[0];
  void [id, rawDecision, recordedDigest, authorityId, withNativeFetch, withNarrowFetch, withThenableFetch, throughFlatFacade];
}
void observations;
