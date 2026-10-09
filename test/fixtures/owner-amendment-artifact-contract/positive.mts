import type { OwnerAmendmentArtifactFetch, OwnerAmendmentArtifactInput, OwnerAmendmentArtifactResult } from '../../../src/owner-amendment/owner-amendment-artifact.mjs';
import type { OwnerAmendmentArtifactDiscoveryFetch, OwnerAmendmentArtifactDiscoveryInput, OwnerAmendmentArtifactDiscoveryResult } from '../../../src/owner-amendment/owner-amendment-artifact-discovery.mjs';
import { fetchOwnerAmendmentBlockArtifact } from '../../../src/owner-amendment/owner-amendment-artifact.mjs';
import { discoverOwnerAmendmentBlockArtifact } from '../../../src/owner-amendment/owner-amendment-artifact-discovery.mjs';

function thenable<T>(value: T): PromiseLike<T> { return Promise.resolve(value); }
const syncFetch: OwnerAmendmentArtifactFetch = () => ({ ok: true, status: 200, json: () => ({ external: 'unknown' }) });
const asyncFetch: OwnerAmendmentArtifactFetch = async () => ({ ok: true, json: async (): Promise<unknown> => ({ external: 'unknown' }) });
const thenableFetch: OwnerAmendmentArtifactFetch = () => thenable({ ok: true, json: () => thenable(17) });
const discoveryFetch: OwnerAmendmentArtifactDiscoveryFetch = () => thenable({ ok: true, json: () => Promise.resolve({ external: 'unknown' }) });
const fetchInput: OwnerAmendmentArtifactInput = { expected: { repository: 'owner/repo', artifactId: 2, runId: '3', runAttempt: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), profile: 'block' }, token: 'token', fetchImpl: thenableFetch };
const discoveryInput: OwnerAmendmentArtifactDiscoveryInput = { expected: { repository: 'owner/repo', runId: 3, runAttempt: '1', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), profile: 'eligibility' }, token: 'token', fetchImpl: discoveryFetch };
declare const fetched: OwnerAmendmentArtifactResult;
declare const discovered: OwnerAmendmentArtifactDiscoveryResult;
if (fetched.status !== 'INCOMPLETE') {
  const name: unknown = fetched.artifactName;
  const digest: unknown = fetched.artifactDigest;
  fetched.zipBytes[0] = 0;
  void [name, digest];
}
if (discovered.status !== 'INCOMPLETE') {
  const name: unknown = discovered.artifactName;
  const expiry: unknown = discovered.expiresAt;
  void [name, expiry];
}
void [fetchOwnerAmendmentBlockArtifact(fetchInput), discoverOwnerAmendmentBlockArtifact(discoveryInput), syncFetch, asyncFetch];

const streamFetch: OwnerAmendmentArtifactFetch = () => ({ ok: true, body: { getReader: () => ({ read: () => Promise.resolve({ done: true }), cancel: () => Promise.resolve(), releaseLock() {} }) } });
void streamFetch;
