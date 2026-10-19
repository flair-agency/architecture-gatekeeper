#!/usr/bin/env node
/**
 * src/gemini-launcher.mjs
 * Flat compatibility facade for the typed Gemini launcher and supervisor.
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildIsolatedRunnerEnv,
  runGeminiLauncherCli,
  runIsolatedGeminiSession,
} from './gemini-cli/launcher-entrypoint.mts';

export { buildIsolatedRunnerEnv, runIsolatedGeminiSession };

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  runGeminiLauncherCli();
}
