#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runHookCli } from './local-review/local-gate.mts';

export {
  runManualReview,
  runManualReviewAsync,
  runManualReviewCli,
  runHook,
  runHookAsync,
  runHookCli,
  validate,
} from './local-review/local-gate.mts';
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) runHookCli();
