import type { GitHubMergeGroupEventFacts, GitHubMergeGroupEventResult } from '../../../src/github/github-merge-group-event.mjs';
declare const parsed: GitHubMergeGroupEventFacts;
const assumedSha: string = parsed.baseSha;
const incompleteWithFacts = { status: 'INCOMPLETE' as const, reason: 'missing', repository: 'owner/repo' };
const incompatible: GitHubMergeGroupEventResult = incompleteWithFacts;
parsed.repository = 'other/repo';
void [assumedSha, incompatible];
