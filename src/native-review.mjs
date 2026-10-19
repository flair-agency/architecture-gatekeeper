#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runNativeReviewCli } from './local-review/native-review.mts';
export { runNativeReviewCli };
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) { runNativeReviewCli().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }); }
