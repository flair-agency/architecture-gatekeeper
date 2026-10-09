import { publishSelfArchitectureCheck } from '../../../src/github/github-app-check-reporter.mjs';
import type { GitHubAppReporterFetch, GitHubAppReporterResult } from '../../../src/github/github-app-check-reporter.mjs';
const external: unknown = {};
const sync: GitHubAppReporterFetch = () => new Response('{}');
const asynchronous: GitHubAppReporterFetch = async () => new Response('{}');
const response = Promise.resolve(new Response('{}'));
const thenable: GitHubAppReporterFetch = () => ({ then: response.then.bind(response) });
for (const fetchImpl of [globalThis.fetch, sync, asynchronous, thenable]) {
  const result: Promise<GitHubAppReporterResult> = publishSelfArchitectureCheck({ app: external, result: external, now: external, fetchImpl });
  void result;
}
declare const published: GitHubAppReporterResult;
const observation: unknown = published.id;
const name: 'architecture-gate / accept' = published.name;
void [observation, name];
