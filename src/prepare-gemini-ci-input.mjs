/** Build the bounded, revision-bound protected inputs for the ordinary Gemini CI profile. */
import { TextDecoder } from 'node:util';
import {
  parseAuthorityManifest,
  readCommittedAuthorityFile,
} from './authority-set.mjs';
import { decodeLimits } from './prepare-authority-set.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from './resolve-ci-policy.mjs';
import { composePreparedGeminiCiPrompt } from './prepared-gemini-ci-review.mjs';
import { encodeGeminiCliPromptForTransport } from './gemini-cli-process.mjs';
import { snapshotPreparedReviewData } from './prepared-review-data.mjs';
import { prepareProtectedCiInput } from './prepare-protected-ci-input.mjs';

const MAX_REVIEW_PROMPT_BYTES = 196_608;
const WORKSPACE_LIMITS = Object.freeze({ maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 });
const MAX_SCHEMA_BYTES = 1_048_576;
const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const RELATIVE_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function fail(message) { throw new Error(`Gemini CI protected input: ${message}`); }
function exactInput(input) {
  const keys = ['root', 'repository', 'baseBranch', 'baseSha', 'headSha', 'reviewedSha',
    'policyPath', 'promptPath', 'schemaPath', 'validationPath', 'referencePaths'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).length !== keys.length ||
      keys.some(key => !Object.hasOwn(input, key) || !Object.getOwnPropertyDescriptor(input, key)?.enumerable ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value')) ||
      Reflect.ownKeys(input).length !== keys.length) fail('complete explicit trusted selectors are required.');
  return Object.fromEntries(keys.map(key => [key, input[key]]));
}

function validPath(value) {
  return typeof value === 'string' && value.length <= 240 && RELATIVE_PATH.test(value) &&
    !value.split('/').some(part => part === '.' || part === '..');
}

function decode(bytes, label) {
  try { return utf8.decode(bytes); } catch { fail(`${label} is not valid UTF-8.`); }
}

async function prepare(supplied, fetchExternal, allowExternal) {
  const input = exactInput(snapshotPreparedReviewData(supplied));
  if (typeof input.root !== 'string' || !input.root || !REPOSITORY.test(input.repository || '') ||
      input.repository.endsWith('.git') || input.repository.includes('..') ||
      typeof input.baseBranch !== 'string' || !input.baseBranch ||
      ![input.baseSha, input.headSha, input.reviewedSha].every(value => SHA.test(value || '')) ||
      new Set([input.baseSha, input.headSha, input.reviewedSha]).size !== 3) {
    fail('repository, base branch, and three distinct full commit revisions are required.');
  }
  for (const name of ['policyPath', 'promptPath', 'schemaPath']) {
    if (!validPath(input[name])) fail(`${name} must be a canonical protected repository path.`);
  }
  if (!Object.hasOwn(input, 'validationPath') || (input.validationPath !== null && !validPath(input.validationPath))) {
    fail('validationPath must be an explicit canonical path or null.');
  }
  if (!Array.isArray(input.referencePaths) || input.referencePaths.length > WORKSPACE_LIMITS.maxFiles ||
      input.referencePaths.some(path => !validPath(path))) {
    fail('referencePaths must be an explicit array of at most 32 canonical protected paths.');
  }
  const selectedPaths = [input.policyPath, input.promptPath, input.schemaPath,
    ...(input.validationPath === null ? [] : [input.validationPath])];
  if (new Set(selectedPaths).size !== selectedPaths.length) fail('protected configuration paths must be distinct.');

  const policyBytes = readCommittedAuthorityFile(input.root, input.baseSha, input.policyPath, WORKSPACE_LIMITS.maxFileBytes);
  const policy = resolveCiPolicy(parseCiPolicyJson(decode(policyBytes, 'base CI policy')), input.baseBranch);
  if (policy.policyVersion !== 6 || policy.mode !== 'enforced' || policy.provider !== 'gemini' ||
      policy.model !== 'gemini-3.8-flash' || policy.thinkingLevel !== 'MEDIUM' || !policy.authorityManifestPath) {
    fail('recorded base policy does not select the supported enforced Gemini profile.');
  }
  const authorityLimits = decodeLimits(policy.authorityLimitsBase64);
  const manifestPath = policy.authorityManifestPath;
  if (!validPath(manifestPath) || selectedPaths.includes(manifestPath)) fail('base policy Authority Set path is invalid or ambiguous.');
  const manifestBytes = readCommittedAuthorityFile(input.root, input.baseSha, manifestPath, authorityLimits.maxManifestBytes);
  const manifest = parseAuthorityManifest(manifestBytes, authorityLimits);
  if (!allowExternal && manifest.authorities.some(member => member.repository !== 'self')) {
    fail('external Authority Set members are unsupported by this input producer.');
  }
  const promptBytes = readCommittedAuthorityFile(input.root, input.baseSha, input.promptPath, WORKSPACE_LIMITS.maxFileBytes);
  const schemaBytes = readCommittedAuthorityFile(input.root, input.baseSha, input.schemaPath, WORKSPACE_LIMITS.maxFileBytes);
  let validationBytes = null;
  if (input.validationPath !== null) {
    validationBytes = readCommittedAuthorityFile(input.root, input.baseSha, input.validationPath, WORKSPACE_LIMITS.maxFileBytes);
  }
  const effectivePromptLimit = Math.min(authorityLimits.maxPromptBytes, MAX_REVIEW_PROMPT_BYTES);
  let prepared;
  try {
    prepared = await prepareProtectedCiInput({
      selection: { ...input, manifestPath },
      limits: { workspace: WORKSPACE_LIMITS, authority: authorityLimits,
        maxSchemaBytes: Math.min(MAX_SCHEMA_BYTES, WORKSPACE_LIMITS.maxFileBytes),
        maxResponseBytes: 65_536, maxDiffBytes: effectivePromptLimit },
      snapshots: [
        { path: input.policyPath, revision: input.baseSha, bytes: policyBytes },
        { path: input.promptPath, revision: input.baseSha, bytes: promptBytes },
        { path: input.schemaPath, revision: input.baseSha, bytes: schemaBytes },
        { path: manifestPath, revision: input.baseSha, bytes: manifestBytes },
        ...(validationBytes === null ? [] : [{ path: input.validationPath, revision: input.baseSha, bytes: validationBytes }]),
      ],
      fetchExternal,
    });
  } catch (error) {
    if (error.message.includes('complete protected prompt exceeds the selected authority prompt byte limit')) {
      fail('complete encoded stdin prompt exceeds the protected limit.');
    }
    throw error;
  }
  const completePrompt = composePreparedGeminiCiPrompt(prepared.protectedPromptText, prepared.protectedDecisionSchemaText);
  const encodedPromptBytes = Buffer.byteLength(encodeGeminiCliPromptForTransport(completePrompt), 'utf8');
  if (encodedPromptBytes > effectivePromptLimit) fail('complete encoded stdin prompt exceeds the protected limit.');
  const bindings = { ...prepared.bindings, completeEncodedPromptBytes: encodedPromptBytes, effectivePromptLimit };
  return {
    protectedPromptText: prepared.protectedPromptText,
    protectedDecisionSchemaText: prepared.protectedDecisionSchemaText,
    protectedReviewer: { provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM' },
    packet: prepared.packet,
    workspaceLimits: prepared.workspaceLimits,
    authorityProvenance: prepared.authorityProvenance,
    validationRules: prepared.validationRules,
    maxResponseBytes: prepared.maxResponseBytes,
    maxSchemaBytes: MAX_SCHEMA_BYTES,
    bindings,
  };
}

/**
 * Prepare ordinary Gemini CI inputs using only a caller-supplied source capability.
 * The capability must authenticate the requested immutable GitHub object and
 * regular-file mode; the shared core checks returned metadata and bounded bytes.
 * This internal helper does not acquire credentials or activate a consumer route.
 */
export async function prepareGeminiCiInput(supplied, fetchExternal = null) {
  if (fetchExternal !== null && typeof fetchExternal !== 'function') fail('external source capability must be a function or null.');
  return prepare(supplied, fetchExternal, true);
}

/** Preserve the prior verification profile's self-only Authority Set behavior. */
export async function prepareGeminiCiVerificationInput(supplied) {
  return prepare(supplied, null, false);
}
