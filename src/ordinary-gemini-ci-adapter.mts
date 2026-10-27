/** Internal host adapter for the adopted ordinary Gemini CI profile. */
import { execFileSync } from 'node:child_process';
import { readCommittedAuthorityFile } from './authority-set.mts';
import { createGitHubAuthoritySource } from './github-authority-source.mts';
import { prepareGeminiCiInput } from './prepare-gemini-ci-input.mts';
import { buildPreparedGeminiCiCall } from './prepared-gemini-ci-call.mts';
import { runPreparedGeminiCiProfileDecision } from './prepared-gemini-ci-profile-decision.mts';
import { inspectPinnedGeminiCiRuntime } from './gemini-ci-runtime.mts';
import { types } from 'node:util';
import { snapshotPreparedReviewData } from './prepared-review-data.mts';
import type { PreparedGeminiCiInput } from './prepare-gemini-ci-input.mts';
import type { PinnedGeminiCiRuntime } from './gemini-ci-runtime.mts';
import type { CiExecutionResult } from './ci-execution/ci-execution-result.mts';
import type { createVertexVerificationReservation } from './vertex-verification-reservation.mts';

export interface OrdinaryGeminiHostContext { root: string; repository: string; baseBranch: string; baseSha: string; headSha: string; reviewedSha: string; runId: string; runAttempt: string; workflowRef: string; policyPath: string; promptPath: string; schemaPath: string; validationPath: string | null; orderedParents: readonly [string, string] }
export interface OrdinaryGeminiAdapterInput { host: Omit<OrdinaryGeminiHostContext, 'orderedParents'>; runtime: { directory: string }; sourceToken: string | null }
export interface OrdinaryGeminiPreparation { readonly context: OrdinaryGeminiHostContext; readonly runtime: PinnedGeminiCiRuntime }
export interface OrdinaryGeminiExecutionInput { preparation: OrdinaryGeminiPreparation; credential: { token: string; project: string; region: string } }
export interface OrdinaryGeminiExecutionResult { context: OrdinaryGeminiHostContext; bindings: PreparedGeminiCiInput['bindings']; authorityProvenance: PreparedGeminiCiInput['authorityProvenance']; execution: CiExecutionResult; decision?: unknown; dispatchDiagnostics: ReturnType<ReturnType<typeof createVertexVerificationReservation>['snapshot']> }

const SELECTORS = Object.freeze({
  runtimeLockPath: '.codex/gatekeeper/gemini-verification-package-lock.json',
});
const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const RELATIVE_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const PINNED_RUNTIME_KEYS = ['entry', 'privateDirectory', 'version', 'cliTarballIntegrity', 'lockSha256',
  'lockDeflateBase64', 'packageJsonSha256', 'entrySha256'] as const satisfies readonly (keyof PinnedGeminiCiRuntime)[];
type PreparationState = { context: OrdinaryGeminiHostContext; prepared: PreparedGeminiCiInput; runtimeDirectory: string; lockBytes: Buffer; pinnedRuntime: PinnedGeminiCiRuntime };
const preparations = new WeakMap<object, PreparationState>();

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} must be a plain data record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
    !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}

function git(root: string, args: string[], maxBuffer = 8_192): string {
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    encoding: 'utf8', maxBuffer, timeout: 10_000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_PAGER: 'cat' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function validateHost(host: unknown): OrdinaryGeminiHostContext {
  const context = exactRecord(host, ['root', 'repository', 'baseBranch', 'baseSha', 'headSha', 'reviewedSha',
    'runId', 'runAttempt', 'workflowRef', 'policyPath', 'promptPath', 'schemaPath', 'validationPath'], 'Ordinary Gemini host context');
  if (typeof context.root !== 'string' || !context.root || typeof context.repository !== 'string' ||
      !REPOSITORY.test(context.repository) || context.repository.endsWith('.git') || context.repository.includes('..') ||
      typeof context.baseBranch !== 'string' || !context.baseBranch ||
      ![context.baseSha, context.headSha, context.reviewedSha].every(value => typeof value === 'string' && SHA.test(value)) ||
      new Set([context.baseSha, context.headSha, context.reviewedSha]).size !== 3 ||
      typeof context.runId !== 'string' || !/^[0-9]{1,20}$/.test(context.runId) ||
      typeof context.runAttempt !== 'string' || !/^[1-9][0-9]{0,5}$/.test(context.runAttempt) ||
      typeof context.workflowRef !== 'string' || !context.workflowRef || context.workflowRef.length > 512 ||
      ![context.policyPath, context.promptPath, context.schemaPath].every(value => typeof value === 'string' && value.length <= 240 && RELATIVE_PATH.test(value) && !value.split('/').some(part => part === '.' || part === '..')) ||
      (context.validationPath !== null && (typeof context.validationPath !== 'string' || context.validationPath.length > 240 || !RELATIVE_PATH.test(context.validationPath) || context.validationPath.split('/').some(part => part === '.' || part === '..')))) {
    throw new Error('Ordinary Gemini host context is incomplete or malformed.');
  }
  const checked = context as Omit<OrdinaryGeminiHostContext, 'orderedParents'>;
  const head = git(checked.root, ['rev-parse', 'HEAD']);
  const parents = git(checked.root, ['rev-list', '--parents', '-n', '1', checked.reviewedSha]).split(/\s+/).slice(1);
  if ((head !== checked.baseSha && head !== checked.reviewedSha) || parents.length !== 2 || parents[0] !== checked.baseSha || parents[1] !== checked.headSha) {
    throw new Error('Git input checkout does not match the host base, head, and ordered merge parents.');
  }
  const orderedParents: readonly [string, string] = [parents[0], parents[1]];
  return Object.freeze({ ...checked, orderedParents: Object.freeze(orderedParents) });
}

/**
 * Prepare revision-bound protected inputs and inspect an already-installed,
 * pinned runtime before any Vertex credential is supplied. Host values and
 * the runtime location/lock must come from a trusted launcher; this function
 * does not authenticate them or establish producer protection.
 */
export async function prepareOrdinaryGeminiCiAdapter(supplied: OrdinaryGeminiAdapterInput): Promise<OrdinaryGeminiPreparation> {
  const input = exactRecord(supplied, ['host', 'runtime', 'sourceToken'], 'Ordinary Gemini adapter input');
  if (['AGK_VERTEX_ACCESS_TOKEN', 'AGK_VERTEX_PROJECT', 'AGK_VERTEX_LOCATION'].some(name => Object.hasOwn(process.env, name))) {
    throw new Error('Ordinary Gemini preparation must finish before Vertex credentials are present.');
  }
  const host = validateHost(input.host);
  const runtime = exactRecord(input.runtime, ['directory'], 'Pinned Gemini runtime input');
  if (typeof runtime.directory !== 'string' || !runtime.directory ||
      (input.sourceToken !== null && (typeof input.sourceToken !== 'string' || !input.sourceToken))) {
    throw new Error('A launcher-selected pinned runtime directory and optional source token are required.');
  }
  const lockBytes = readCommittedAuthorityFile(host.root, host.baseSha, SELECTORS.runtimeLockPath, 2_097_152);
  const pinnedRuntime = inspectPinnedGeminiCiRuntime({ runtimeDirectory: runtime.directory, lockBytes });
  let fetchExternal = null;
  if (input.sourceToken !== null) fetchExternal = createGitHubAuthoritySource({ token: input.sourceToken });
  const prepared = await prepareGeminiCiInput({
    root: host.root,
    repository: host.repository,
    baseBranch: host.baseBranch,
    baseSha: host.baseSha,
    headSha: host.headSha,
    reviewedSha: host.reviewedSha,
    policyPath: host.policyPath,
    promptPath: host.promptPath,
    schemaPath: host.schemaPath,
    validationPath: host.validationPath,
    referencePaths: [],
  }, fetchExternal);
  const preparation = Object.freeze({ context: host, runtime: pinnedRuntime });
  preparations.set(preparation, { context: host, prepared, runtimeDirectory: runtime.directory, lockBytes, pinnedRuntime });
  return preparation;
}

/**
 * Execute one prepared profile session with a parent-held Vertex credential.
 * The handle is process-local; this is not a serialized cross-step handoff.
 * Returned response bytes are an owned mutable copy, not authenticated evidence.
 */
export async function executeOrdinaryGeminiCiAdapter(supplied: OrdinaryGeminiExecutionInput): Promise<OrdinaryGeminiExecutionResult> {
  const input = exactRecord(supplied, ['preparation', 'credential'], 'Ordinary Gemini execution input');
  const preparation = input.preparation;
  if (!preparation || typeof preparation !== 'object') throw new Error('Ordinary Gemini preparation must come from the trusted prepare phase.');
  const state = preparations.get(preparation);
  if (!state) throw new Error('Ordinary Gemini preparation must come from the trusted prepare phase.');
  preparations.delete(preparation);
  const currentRuntime = inspectPinnedGeminiCiRuntime({ runtimeDirectory: state.runtimeDirectory, lockBytes: state.lockBytes });
  for (const key of PINNED_RUNTIME_KEYS) {
    if (currentRuntime[key] !== state.pinnedRuntime[key]) throw new Error('Pinned Gemini runtime changed after preparation.');
  }
  // buildPreparedGeminiCiCall performs the credential's closed-record and
  // primitive-field checks before retaining or using these captured values.
  const credential = input.credential as OrdinaryGeminiExecutionInput['credential'];
  const call = buildPreparedGeminiCiCall({ prepared: state.prepared, credential,
    runtimeEntry: currentRuntime.entry, privateParentDirectory: currentRuntime.privateDirectory });
  const result = await runPreparedGeminiCiProfileDecision(call);
  const execution = Object.freeze(result.execution.status === 'completed'
    ? { ...result.execution, responseBytes: Buffer.from(result.execution.responseBytes) }
    : { ...result.execution });
  return Object.freeze({ context: state.context, bindings: snapshotPreparedReviewData(state.prepared.bindings),
    authorityProvenance: snapshotPreparedReviewData(state.prepared.authorityProvenance), execution,
    decision: result.decision, dispatchDiagnostics: result.dispatchDiagnostics });
}
