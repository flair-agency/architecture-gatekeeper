/** Inactive parent-process composition; the invoking host still owns admission. */
import { types } from 'node:util';
import { prepareOrdinaryGeminiCiAdapter, executeOrdinaryGeminiCiAdapter } from './ordinary-gemini-ci-adapter.mjs';
import { acquireGitHubVertexWifCredential } from './github-vertex-wif.mjs';

/**
 * Prepare complete protected inputs before issuing a Vertex credential, then
 * execute the selected profile once in the same parent process. Configuration
 * and GitHub OIDC capability come from the trusted launcher, never the candidate.
 * This internal composition authenticates neither its caller nor a producer;
 * it publishes no output and activates no workflow or acceptance route.
 * fetchImpl is the parent-only HTTP implementation, including offline fixtures.
 */
export async function runOrdinaryGeminiCiLauncher(supplied, fetchImpl = globalThis.fetch) {
  const keys = ['host', 'runtime', 'sourceToken', 'wif'];
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || types.isProxy(supplied) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(supplied))) {
    throw new Error('Ordinary Gemini launcher requires a plain data record.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(supplied);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
    !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
    throw new Error('Ordinary Gemini launcher has unsupported or missing fields.');
  }
  const input = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
  const preparation = await prepareOrdinaryGeminiCiAdapter({ host: input.host,
    runtime: input.runtime, sourceToken: input.sourceToken });
  const credential = await acquireGitHubVertexWifCredential(input.wif, fetchImpl);
  return executeOrdinaryGeminiCiAdapter({ preparation, credential });
}
