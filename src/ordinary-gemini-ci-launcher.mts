/** Inactive parent-process composition; the invoking host still owns admission. */
import { types } from 'node:util';
import { prepareOrdinaryGeminiCiAdapter, executeOrdinaryGeminiCiAdapter } from './ordinary-gemini-ci-adapter.mjs';
import { acquireGitHubVertexWifCredential, type WifFetch, type WifSecretRegistrar } from './github-vertex-wif.mts';
import { readCommittedAuthorityFile } from './authority-set.mjs';
import { installPinnedGeminiCiRuntime } from './gemini-ci-runtime.mjs';

const GEMINI_RUNTIME_LOCK_PATH = '.codex/gatekeeper/gemini-verification-package-lock.json';
const SHA = /^[a-f0-9]{40}$/;

/**
 * Install the ordinary Gemini CLI into a fresh private runtime directory using
 * only the package lock committed at the explicitly supplied protected base.
 * This helper authenticates neither its caller nor any producer and creates no
 * acceptance or admission evidence.
 */
export function prepareOrdinaryGeminiCiRuntime(supplied: unknown): ReturnType<typeof installPinnedGeminiCiRuntime> {
  const keys = ['root', 'baseSha', 'runtimeDirectory'];
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || types.isProxy(supplied) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(supplied))) {
    throw new Error('Ordinary Gemini runtime input requires a plain data record.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(supplied);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
    !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
    throw new Error('Ordinary Gemini runtime input has unsupported or missing fields.');
  }
  const input = Object.fromEntries(keys.map(key => [key, descriptors[key].value])) as Record<string, unknown>;
  if (typeof input.root !== 'string' || !input.root || typeof input.runtimeDirectory !== 'string' ||
      !input.runtimeDirectory || typeof input.baseSha !== 'string' || !SHA.test(input.baseSha)) {
    throw new Error('Ordinary Gemini runtime requires nonempty paths and an exact protected base SHA.');
  }
  if (['AGK_VERTEX_ACCESS_TOKEN', 'AGK_VERTEX_PROJECT', 'AGK_VERTEX_LOCATION'].some(name => Object.hasOwn(process.env, name))) {
    throw new Error('Ordinary Gemini runtime preparation must finish before Vertex credentials are present.');
  }
  const lockBytes = readCommittedAuthorityFile(input.root, input.baseSha, GEMINI_RUNTIME_LOCK_PATH, 2_097_152);
  return installPinnedGeminiCiRuntime({ runtimeDirectory: input.runtimeDirectory, lockBytes });
}

/**
 * Prepare complete protected inputs before issuing a Vertex credential, then
 * execute the selected profile once in the same parent process. Configuration
 * and GitHub OIDC capability come from the trusted launcher, never the candidate.
 * This internal composition authenticates neither its caller nor a producer;
 * it publishes no output and activates no workflow or acceptance route.
 * fetchImpl is the parent-only HTTP implementation, including offline fixtures.
 * registerSecret is a synchronous trusted-host registrar, never candidate data.
 */
export async function runOrdinaryGeminiCiLauncher(supplied: unknown, fetchImpl: WifFetch = globalThis.fetch, registerSecret?: WifSecretRegistrar): Promise<unknown> {
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
  const input = Object.fromEntries(keys.map(key => [key, descriptors[key].value])) as Record<string, unknown>;
  const preparation = await prepareOrdinaryGeminiCiAdapter({ host: input.host,
    runtime: input.runtime, sourceToken: input.sourceToken });
  const credential = await acquireGitHubVertexWifCredential(input.wif, fetchImpl, registerSecret);
  return executeOrdinaryGeminiCiAdapter({ preparation, credential });
}
