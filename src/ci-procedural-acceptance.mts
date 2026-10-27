#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { assertProceduralV5Acceptance, runProceduralV5AcceptanceCli } from './ci-review/ci-procedural-acceptance.mts';
export { assertProceduralV5Acceptance };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runProceduralV5AcceptanceCli();
}
