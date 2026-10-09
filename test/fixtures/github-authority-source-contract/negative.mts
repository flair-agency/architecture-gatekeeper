import { createGitHubAuthoritySource } from '../../../src/github/github-authority-source.mjs';

createGitHubAuthoritySource({ token: 'test-token', fetchImpl: 42 });

const fetchExternal = createGitHubAuthoritySource({ token: 'test-token' });
async function inspect(request: Parameters<typeof fetchExternal>[0]) {
  const repository: string = request.repository;
  const result = await fetchExternal(request);
  const content: string = result.content;
  return { repository, content };
}
void inspect;

import type { GitHubAuthorityFetch } from '../../../src/github/github-authority-source.mjs';
const wrongUrl: GitHubAuthorityFetch = (_url: number, _options) => new Response('{}');
const wrongBody: GitHubAuthorityFetch = () => ({ status: 200, body: { getReader: 'not callable' } });
void [wrongUrl, wrongBody];
