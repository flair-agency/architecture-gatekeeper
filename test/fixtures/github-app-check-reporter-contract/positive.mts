import { beginSelfArchitectureCheck, beginSelfQueueCompletenessCheck, finalizeSelfArchitectureCheck,
  finalizeSelfQueueCompletenessCheck, publishSelfArchitectureCheck } from '../../../src/github/github-app-check-reporter.mjs';
import type { GitHubAppReporterFetch, GitHubAppReporterResult, GitHubAppCheckHandle, SelfQueueCheckHandle } from '../../../src/github/github-app-check-reporter.mjs';
const external: unknown = {};
const sync: GitHubAppReporterFetch = () => new Response('{}');
const asynchronous: GitHubAppReporterFetch = async () => new Response('{}');
const response = Promise.resolve(new Response('{}'));
const thenable: GitHubAppReporterFetch = () => ({ then: response.then.bind(response) });
for (const fetchImpl of [globalThis.fetch, sync, asynchronous, thenable]) {
  const result: Promise<GitHubAppReporterResult> = publishSelfArchitectureCheck({ app: external, result: external, now: external, fetchImpl });
  void result;
  const appCheck: Promise<GitHubAppCheckHandle> = beginSelfArchitectureCheck({ app: external, headSha: external, now: external, fetchImpl });
  const queueCheck: Promise<SelfQueueCheckHandle> = beginSelfQueueCompletenessCheck({ token: external, headSha: external, now: external, fetchImpl });
  void appCheck.then(check => finalizeSelfArchitectureCheck({ app: external, check, conclusion: 'success', now: external, fetchImpl }));
  void queueCheck.then(check => finalizeSelfQueueCompletenessCheck({ token: external, check, conclusion: 'failure', now: external, fetchImpl }));
}
declare const published: GitHubAppReporterResult;
const observation: unknown = published.id;
const name: 'architecture-gate / protected-accept' = published.name;
void [observation, name];
