import {
  createGitHubAuthoritySource,
  type GitHubAuthorityAwaitable,
  type GitHubAuthorityFetchResponse,
  type GitHubAuthorityReader,
  type GitHubAuthorityRequest,
  type GitHubAuthorityResult,
  type GitHubAuthoritySource,
} from '../../../src/github/github-authority-source.mjs';

const defaultSource = createGitHubAuthoritySource({ token: 'test-token' });
const standardFetchSource = createGitHubAuthoritySource({ token: 'test-token', fetchImpl: globalThis.fetch });
const source: GitHubAuthoritySource = createGitHubAuthoritySource({
  token: 'test-token',
  fetchImpl: (url, options) => {
    const parsedUrl: URL = new URL(url);
    const method: 'GET' = options.method;
    void parsedUrl;
    void method;
    return {
      status: 200,
      body: {
        getReader: () => ({
          read: () => ({ done: true, value: undefined }),
          cancel: () => undefined,
        }),
      },
    };
  },
});

const promiseSource = createGitHubAuthoritySource({
  token: 'test-token',
  fetchImpl: async () => ({
    status: 200,
    body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => undefined }) },
  }),
});

const thenable: PromiseLike<GitHubAuthorityFetchResponse> = {
  then(resolve) {
    return Promise.resolve({ status: 200, body: { getReader: () => ({ read: () => ({ done: true }), cancel: () => undefined }) } }).then(resolve);
  },
};
const thenableSource = createGitHubAuthoritySource({ token: 'test-token', fetchImpl: () => thenable });

const reader: GitHubAuthorityReader = {
  read: () => ({ done: false, value: new Uint8Array([1]) }),
  cancel: () => Promise.resolve(),
};
const callbackValue: GitHubAuthorityAwaitable<{ done?: unknown; value?: unknown }> = Promise.resolve({ done: true });
void callbackValue;
void reader;

const request: GitHubAuthorityRequest = {
  repository: 'owner/repository', revision: 'a'.repeat(40), path: 'docs/architecture.md', maxBytes: 1024,
};
const composed: (input: { repository: string; revision: string; path: string; maxBytes: number }) => Promise<GitHubAuthorityResult> = source;
void composed;
void request;
void defaultSource;
void standardFetchSource;
void promiseSource;
void thenableSource;
