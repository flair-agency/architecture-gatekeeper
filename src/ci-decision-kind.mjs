#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { runCiDecisionKindCli } from './ci-review/ci-decision-kind.mts';

export { ordinaryDecisionKind } from './ci-review/ci-decision-kind.mts';

// Keep the guard here: after extraction, import.meta.url in the leaf identifies
// the nested helper and would no longer match this flat executable path.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCiDecisionKindCli();
}
