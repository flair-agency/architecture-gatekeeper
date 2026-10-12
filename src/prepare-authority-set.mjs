#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeLimits, prepareAuthoritySet, runPrepareAuthoritySetCli } from './authority-validation/prepare-authority-set.mts';
import { realpathSync } from 'node:fs';

export { decodeLimits, prepareAuthoritySet };

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  runPrepareAuthoritySetCli().catch(() => { process.stderr.write('Authority Set preparation failed.\n'); process.exitCode = 1; });
}
