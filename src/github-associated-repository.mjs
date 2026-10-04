// GitHub Actions can return compact repository objects in pull_requests.
// This fallback applies only to those associations, never top-level identity.
export function matchesGitHubAssociatedRepository(repo, { repository, repositoryId }) {
  // Preserve existing full_name matching; a supplied conflict cannot fall back.
  if (repo?.full_name !== undefined) return repo.full_name === repository;
  if (!Number.isSafeInteger(repositoryId) || repositoryId < 1 || repo?.id !== repositoryId) return false;
  const [owner, name] = repository.split('/');
  return repo?.name === name && repo?.url === `https://api.github.com/repos/${owner}/${name}`;
}
