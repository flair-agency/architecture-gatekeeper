#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runOwnerAdditionFinalizeCli } from './owner-addition/finalize-owner-addition.mts';
export { buildOwnerAdditionFinalRecord, verifyG0TagObjectEvidence, readG0TagObjectReadback, summarizeG0TagRefReadback, verifyMergeAncestorComparison, parsePinnedGatekeeperWorkflow, validateOwnerAdditionProducerJobName, parseGatekeeperWorkflowDefaults, finalizeOwnerAddition } from './owner-addition/finalize-owner-addition.mts';

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  await runOwnerAdditionFinalizeCli();
}
