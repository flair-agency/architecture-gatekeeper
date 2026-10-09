import { verifyGitHubOwnerAmendmentReadback } from '../../../src/github/github-owner-amendment-readback.mjs';
import { createGitHubAuthoritySource } from '../../../src/github/github-authority-source.mjs';
import type { GitHubOwnerAmendmentReadbackFetch, GitHubOwnerAmendmentReadbackResult } from '../../../src/github/github-owner-amendment-readback.mjs';
import type { GitHubAuthorityFetch } from '../../../src/github/github-authority-source.mjs';
const external: unknown = {};
const sync: GitHubOwnerAmendmentReadbackFetch = (_url, _options) => new Response('{}');
const asynchronous: GitHubOwnerAmendmentReadbackFetch = async (_url, _options) => new Response('{}');
const response = Promise.resolve(new Response('{}'));
const thenable: GitHubOwnerAmendmentReadbackFetch = (_url, _options) => ({ then: response.then.bind(response) });
const shared: GitHubAuthorityFetch = sync;
const source = createGitHubAuthoritySource({ token: external, fetchImpl: sync });
void source({ repository: external, revision: external, path: external, maxBytes: external });
void verifyGitHubOwnerAmendmentReadback();
void verifyGitHubOwnerAmendmentReadback({ token: external, repository: external, fetchImpl: globalThis.fetch });
for (const fetchImpl of [sync, asynchronous, thenable]) {
  const result: Promise<GitHubOwnerAmendmentReadbackResult> = verifyGitHubOwnerAmendmentReadback({ token: external, fetchImpl });
  void result;
}
declare const result: GitHubOwnerAmendmentReadbackResult;
const observedTree: unknown = result.treeSha;
const capturedPath: string = result.authorityPath;
const computedDigest: string = result.authorityDigest;
void [shared, observedTree, capturedPath, computedDigest];
