/** Build the fixed ordinary Gemini CI decision call from trusted prepared inputs. */
import { types } from 'node:util';
import { snapshotPreparedGeminiCiReviewInput } from './prepared-gemini-ci-review.mjs';
import { snapshotPreparedReviewData } from './prepared-review-data.mjs';

const PREPARED_KEYS = ['protectedPromptText', 'protectedDecisionSchemaText', 'protectedReviewer', 'packet',
  'workspaceLimits', 'authorityProvenance', 'validationRules', 'maxResponseBytes', 'maxSchemaBytes', 'bindings'];
const CREDENTIAL_KEYS = ['token', 'project', 'region'];
const CALL_KEYS = ['prepared', 'credential', 'runtimeEntry', 'privateParentDirectory'];

function exactPlainRecord(value, keys, label) {
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

function preparedRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('Prepared Gemini CI input must be a plain data record.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const required = PREPARED_KEYS.filter(key => key !== 'bindings');
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !PREPARED_KEYS.includes(key) ||
      !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable) ||
      required.some(key => !Object.hasOwn(descriptors, key))) {
    throw new Error('Prepared Gemini CI input has unsupported or missing fields.');
  }
  return Object.fromEntries(Object.keys(descriptors).map(key => [key, descriptors[key].value]));
}

/**
 * Construct the exact ordinary-profile call accepted by
 * runPreparedGeminiCiProfileDecision. Protected preparation, credential
 * issuance, runtime pinning, producer identity and reporting belong to caller.
 */
export function buildPreparedGeminiCiCall(supplied) {
  const call = exactPlainRecord(supplied, CALL_KEYS, 'Gemini CI call');
  const { prepared, credential, runtimeEntry, privateParentDirectory } = call;
  const preparedData = preparedRecord(prepared);
  const credentialData = exactPlainRecord(credential, CREDENTIAL_KEYS, 'Vertex credential');
  if (typeof runtimeEntry !== 'string' || !runtimeEntry || typeof privateParentDirectory !== 'string' || !privateParentDirectory ||
      typeof credentialData.token !== 'string' || typeof credentialData.project !== 'string' || typeof credentialData.region !== 'string') {
    throw new Error('Gemini CI call requires explicit runtime, private directory, and credential strings.');
  }

  // Snapshot supported plain-data records before retaining caller-owned values.
  const protectedReviewer = snapshotPreparedReviewData(preparedData.protectedReviewer);
  const packet = snapshotPreparedReviewData(preparedData.packet);
  const workspaceLimits = snapshotPreparedReviewData(preparedData.workspaceLimits);
  const authorityProvenance = snapshotPreparedReviewData(preparedData.authorityProvenance);
  const validationRules = snapshotPreparedReviewData(preparedData.validationRules);
  const reviewInput = snapshotPreparedGeminiCiReviewInput({
    protectedPromptText: preparedData.protectedPromptText,
    protectedDecisionSchemaText: preparedData.protectedDecisionSchemaText,
    protectedReviewer,
    proxySessionOptions: {
      packet,
      workspaceLimits,
      workspaceParentDirectory: privateParentDirectory,
      processOptions: {
        cliEntrypoint: runtimeEntry,
        privateParentDirectory,
        model: 'gemini-3.8-flash',
        thinkingLevel: 'MEDIUM',
        maxOutputTokens: 16_384,
        project: credentialData.project,
        region: credentialData.region,
        timeoutMs: 180_000,
        maxPromptBytes: 196_608,
        maxStdoutBytes: 65_536,
        maxStderrBytes: 65_536,
      },
      credentials: { type: 'bearer', value: credentialData.token },
    },
  });
  return Object.freeze({ reviewInput, authorityProvenance, validationRules,
    maxResponseBytes: preparedData.maxResponseBytes, maxSchemaBytes: preparedData.maxSchemaBytes });
}
