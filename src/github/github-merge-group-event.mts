// Parse GitHub's merge_group event into untrusted event facts. This does not
// establish exact-B identity, provenance, eligibility, or acceptance.
export type GitHubMergeGroupEventFacts = Readonly<{
  status: 'PARSED_MERGE_GROUP_EVENT'; action: unknown; repository: string;
  baseSha: unknown; headSha: unknown; baseRef: unknown;
}>;
export type GitHubMergeGroupEventResult = GitHubMergeGroupEventFacts | Readonly<{
  status: 'INCOMPLETE'; reason: string;
} & { [K in Exclude<keyof GitHubMergeGroupEventFacts, 'status'>]?: never }>;
// Erased access views retain the original external property reads; they do not
// establish stable values, exact-B identity, provenance or acceptance.
type PayloadView = { action?: unknown; merge_group?: unknown; repository?: { full_name?: unknown } };
type GroupView = { base_sha?: unknown; head_sha?: unknown; base_ref?: unknown };

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REF_FORBIDDEN = /[\x00-\x20\x7f~^:?*\\[]/;

function invalid(reason: string): Extract<GitHubMergeGroupEventResult, { status: 'INCOMPLETE' }> {
  return Object.freeze({ status: 'INCOMPLETE', reason: `GitHub merge_group event ${reason}` });
}

function validBranchRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('refs/heads/')) return false;
  const name = value.slice('refs/heads/'.length);
  if (!name || name.startsWith('/') || name.endsWith('/') || name.endsWith('.') ||
      name.includes('..') || name.includes('//') || name.includes('@{') || REF_FORBIDDEN.test(name)) return false;
  return name.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

/**
 * Read only the conservative facts in a GitHub `merge_group` checks_requested
 * payload. The caller must independently establish trust and bind these facts
 * to its protected policy and exact candidate.
 */
export function parseGithubMergeGroupEvent(payload: unknown): GitHubMergeGroupEventResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return invalid('payload is missing or malformed.');
  if ((payload as PayloadView).action !== 'checks_requested') return invalid('action is not checks_requested.');
  const group = (payload as PayloadView).merge_group;
  if (!group || typeof group !== 'object' || Array.isArray(group)) return invalid('merge_group is missing or malformed.');
  const repository = (payload as PayloadView).repository?.full_name;
  if (typeof repository !== 'string' || !REPOSITORY.test(repository)) return invalid('repository.full_name is missing or malformed.');
  if (typeof (group as GroupView).base_sha !== 'string' || !SHA.test((group as GroupView).base_sha as string) ||
      typeof (group as GroupView).head_sha !== 'string' || !SHA.test((group as GroupView).head_sha as string) ||
      (group as GroupView).base_sha === (group as GroupView).head_sha) return invalid('base_sha or head_sha is missing or malformed.');
  if (!validBranchRef((group as GroupView).base_ref)) return invalid('base_ref is missing or malformed.');

  return Object.freeze({
    status: 'PARSED_MERGE_GROUP_EVENT',
    action: (payload as PayloadView).action,
    repository,
    baseSha: (group as GroupView).base_sha,
    headSha: (group as GroupView).head_sha,
    baseRef: (group as GroupView).base_ref,
  });
}
