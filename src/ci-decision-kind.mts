#!/usr/bin/env node
import { appendGitHubOutput } from './runner-temp-path.mts';
import { fileURLToPath } from 'node:url';
import { ordinaryDecisionKind } from './ci-review/ci-decision-kind.mts';

export { ordinaryDecisionKind } from './ci-review/ci-decision-kind.mts';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const kind = ordinaryDecisionKind(process.env.DECISION);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  appendGitHubOutput(`kind=${kind}\n`);
}
