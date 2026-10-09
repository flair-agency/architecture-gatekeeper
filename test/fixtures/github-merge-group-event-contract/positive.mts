import { parseGithubMergeGroupEvent } from '../../../src/github/github-merge-group-event.mjs';
import type { GitHubMergeGroupEventResult } from '../../../src/github/github-merge-group-event.mjs';
const external: unknown = {};
const observation: GitHubMergeGroupEventResult = parseGithubMergeGroupEvent(external);
if (observation.status === 'PARSED_MERGE_GROUP_EVENT') {
  const capturedRepository: string = observation.repository;
  const rereadFacts: unknown[] = [observation.action, observation.baseSha, observation.headSha, observation.baseRef];
  void [capturedRepository, rereadFacts];
} else {
  const reason: string = observation.reason;
  void reason;
}
