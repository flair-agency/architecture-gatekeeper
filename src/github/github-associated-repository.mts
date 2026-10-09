// GitHub Actions can return compact repository objects in pull_requests.
// This fallback applies only to those associations, never top-level identity.
interface AssociatedRepository {
  full_name?: unknown;
  id?: unknown;
  name?: unknown;
  url?: unknown;
}

interface AssociatedRepositoryExpectation {
  repository: unknown;
  repositoryId: unknown;
}

export function matchesGitHubAssociatedRepository(repo: unknown, { repository, repositoryId }: AssociatedRepositoryExpectation): boolean {
  // Preserve existing full_name matching; a supplied conflict cannot fall back.
  if ((repo as AssociatedRepository | null | undefined)?.full_name !== undefined) return (repo as AssociatedRepository).full_name === repository;
  if (!Number.isSafeInteger(repositoryId) || (repositoryId as number) < 1 || (repo as AssociatedRepository | null | undefined)?.id !== repositoryId) return false;
  const [owner, name] = (repository as string).split('/');
  return (repo as AssociatedRepository | null | undefined)?.name === name && (repo as AssociatedRepository | null | undefined)?.url === `https://api.github.com/repos/${owner}/${name}`;
}
