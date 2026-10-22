#!/usr/bin/env node
// Protected workflow_run relay to current live merge-group context; context only, never acceptance.
import { execFileSync } from 'node:child_process';
import { openSync, closeSync, fstatSync, readFileSync, constants } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOwnerAmendmentWorkflowRunMergeGroupContext } from '../dist/owner-amendment-workflow-run-merge-group-context.mjs';
import { appendGitHubOutput, resolveRunnerTempDirectory, writeRunnerTempFile } from '../dist/runner-temp-path.mjs';

const REPOSITORY = 'flair-agency/architecture-gatekeeper';
const REPOSITORY_ID = 1379218762;
const SHA = /^[a-f0-9]{40}$/;
const MAX_EVENT_BYTES = 262_144;
const MAX_API_RESPONSE_BYTES = 262_144;
const MAX_API_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_API_REQUEST_MS = 10_000;
const MAX_API_TOTAL_MS = 60_000;
const MAX_API_REQUESTS = 110;
const QUEUE_STATES = new Set(['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED']);
const fail = message => { throw new Error(`Self queue context: ${message}`); };

function readEvent(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) fail('GitHub event path is unavailable.');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > MAX_EVENT_BYTES) fail('GitHub event file is not a bounded regular file.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(fd)));
  } finally { if (fd !== undefined) closeSync(fd); }
}

function protectedRuntimeRevision(workspace) {
  if (typeof workspace !== 'string' || !isAbsolute(workspace) || resolve(workspace) !== workspace) fail('protected workflow workspace is unavailable.');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8', timeout: 10_000, maxBuffer: 4096 }).trim();
  if (!SHA.test(revision)) fail('protected runtime revision is malformed.');
  return revision;
}

function expectedRelay(workflowIdValue, workflowPath) {
  if (typeof workflowIdValue !== 'string' || !/^[1-9][0-9]*$/.test(workflowIdValue)) fail('protected relay workflow ID is invalid.');
  const workflowId = Number(workflowIdValue);
  if (!Number.isSafeInteger(workflowId) || typeof workflowPath !== 'string' ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(workflowPath)) fail('protected relay workflow path is invalid.');
  return { workflowId, workflowPath };
}

function validateWakeup(event, eventName) {
  if (eventName !== 'workflow_run' || !event || typeof event !== 'object' || Array.isArray(event) || event.action !== 'completed' ||
      event.repository?.full_name !== REPOSITORY || event.repository?.id !== REPOSITORY_ID) fail('event is not a completed workflow_run for the fixed self repository.');
  const run = event.workflow_run;
  if (!run || !Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) fail('workflow_run selectors are invalid.');
  return { action: 'completed', workflow_run: { id: run.id, run_attempt: run.run_attempt } };
}

function validateSelection(selection, expected, runtimeRevision, wakeup) {
  if (!selection || selection.status !== 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT' ||
      selection.repository !== REPOSITORY || selection.repositoryId !== REPOSITORY_ID ||
      selection.workflowId !== expected.workflowId || selection.workflowPath !== expected.workflowPath ||
      selection.runId !== wakeup.workflow_run.id || selection.runAttempt !== wakeup.workflow_run.run_attempt ||
      !SHA.test(selection.workflowRunHeadSha) || !SHA.test(selection.observedQueueRefSha) ||
      selection.workflowRunHeadSha !== selection.observedQueueRefSha ||
      typeof selection.observedQueueBranch !== 'string' || !selection.observedQueueBranch.startsWith('gh-readonly-queue/main/') ||
      !SHA.test(selection.currentMainSha) || selection.currentMainSha !== runtimeRevision ||
      typeof selection.bPrNumber !== 'string' || !/^[1-9][0-9]*$/.test(selection.bPrNumber) || !SHA.test(selection.bHeadSha) ||
      !QUEUE_STATES.has(selection.queueEntryState) || typeof selection.queueEntryEnqueuedAt !== 'string' ||
      !Number.isFinite(Date.parse(selection.queueEntryEnqueuedAt)) ||
      selection.assurance !== 'context selection only; no policy, evidence, eligibility, or acceptance claim') {
    fail('live queue resolver did not return a complete exact current protected context.');
  }
  return selection;
}

/** Fixed-endpoint bounded adapter for the existing queue-context resolver. */
export function createBoundedSelfQueueApiFetch(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') fail('GitHub API reader is unavailable.');
  const controller = new AbortController();
  const deadline = Date.now() + MAX_API_TOTAL_MS;
  let totalBytes = 0;
  let requestCount = 0;
  let rejectTotal;
  const totalTimeout = new Promise((_, reject) => { rejectTotal = reject; });
  const totalTimer = setTimeout(() => { controller.abort(); rejectTotal(new Error('Queue API total deadline exceeded.')); }, MAX_API_TOTAL_MS);
  const within = promise => Promise.race([Promise.resolve(promise), totalTimeout]);
  const apiRoot = `https://api.github.com/repos/${REPOSITORY}`;
  const dispose = () => { clearTimeout(totalTimer); controller.abort(); };
  const boundedFetch = async (input, options = {}) => {
    requestCount += 1;
    if (requestCount > MAX_API_REQUESTS) fail('queue metadata request count exceeds its bound.');
    let url;
    try { url = new URL(input); } catch { fail('queue metadata URL is malformed.'); }
    if (url.origin !== 'https://api.github.com' || url.username || url.password || url.hash ||
        !(url.href === 'https://api.github.com/graphql' || url.href === apiRoot || url.href.startsWith(`${apiRoot}/`)) || options.redirect !== 'error') {
      fail(`queue metadata request is outside the fixed GitHub API endpoints: ${url.href}`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) { dispose(); fail('queue metadata total deadline exceeded.'); }
    const requestController = new AbortController();
    const signal = AbortSignal.any([controller.signal, requestController.signal]);
    const timeoutMs = Math.min(MAX_API_REQUEST_MS, remaining);
    let rejectRequest;
    const requestTimeout = new Promise((_, reject) => { rejectRequest = reject; });
    const requestTimer = setTimeout(() => { requestController.abort(); rejectRequest(new Error('Queue API request timed out.')); }, timeoutMs);
    const withinRequest = promise => Promise.race([within(promise), requestTimeout]);
    let reader;
    let complete = false;
    try {
      const response = await withinRequest(fetchImpl(url.href, { ...options, signal, redirect: 'error' }));
      if (!response || response.status !== 200 || response.redirected === true || (response.url && response.url !== url.href) ||
          !response.body || typeof response.body.getReader !== 'function') fail('queue metadata response is unavailable, redirected, or malformed.');
      const declared = response.headers?.get?.('content-length');
      if (declared !== null && declared !== undefined &&
          (typeof declared !== 'string' || !/^\d+$/.test(declared) || Number(declared) > MAX_API_RESPONSE_BYTES)) fail('queue metadata response exceeds its byte bound.');
      reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const part = await withinRequest(reader.read());
        if (part.done === true) break;
        if (!(part.value instanceof Uint8Array) || part.value.byteLength === 0) fail('queue metadata response body is malformed.');
        size += part.value.byteLength;
        totalBytes += part.value.byteLength;
        if (size > MAX_API_RESPONSE_BYTES || totalBytes > MAX_API_TOTAL_BYTES) fail('queue metadata response bytes exceed their bound.');
        chunks.push(part.value);
      }
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
      complete = true;
      return { status: response.status, ok: true, redirected: false, url: url.href, json: async () => data };
    } finally {
      clearTimeout(requestTimer);
      if (reader && !complete) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* preserve the original failure */ } }
      if (requestCount >= MAX_API_REQUESTS || totalBytes >= MAX_API_TOTAL_BYTES || Date.now() >= deadline) dispose();
    }
  };
  Object.defineProperty(boundedFetch, 'dispose', { value: dispose });
  return boundedFetch;
}

/** Resolve live queue metadata, bind protected runtime to current main, then persist relay context. */
export async function prepareSelfQueueContext({ event, eventName, repository, repositoryId, workflowId, workflowPath,
  runtimeRevision, token, resolveContext = resolveOwnerAmendmentWorkflowRunMergeGroupContext,
  fetchImpl = fetch, writeEvent, emitOutput } = {}) {
  if (repository !== REPOSITORY || !/^[1-9][0-9]*$/.test(repositoryId) || Number(repositoryId) !== REPOSITORY_ID || !Number.isSafeInteger(Number(repositoryId))) fail('protected caller repository identity is invalid.');
  const expectedRelayIdentity = expectedRelay(workflowId, workflowPath);
  const wakeup = validateWakeup(event, eventName);
  if (!SHA.test(runtimeRevision)) fail('protected runtime revision is invalid.');
  if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[\r\n]/.test(token)) fail('authenticated metadata token is unavailable.');
  if (typeof resolveContext !== 'function' || typeof writeEvent !== 'function' || typeof emitOutput !== 'function') fail('protected queue context operations are unavailable.');

  const boundedFetch = createBoundedSelfQueueApiFetch(fetchImpl);
  let selection;
  try { selection = await resolveContext({ event: wakeup, token, expected: {
    repository: REPOSITORY, repositoryId: REPOSITORY_ID,
    workflowId: expectedRelayIdentity.workflowId, workflowPath: expectedRelayIdentity.workflowPath, targetBranch: 'main',
  }, fetchImpl: boundedFetch }); }
  finally { boundedFetch.dispose(); }
  const current = validateSelection(selection, expectedRelayIdentity, runtimeRevision, wakeup);
  const mergeGroupEvent = {
    action: 'checks_requested', repository: { full_name: REPOSITORY, id: REPOSITORY_ID },
    merge_group: { base_ref: 'refs/heads/main', base_sha: current.currentMainSha, head_sha: current.observedQueueRefSha },
  };
  const outputs = {
    base_sha: current.currentMainSha,
    group_sha: current.observedQueueRefSha,
    pr_number: current.bPrNumber,
    b_sha: current.bHeadSha,
  };
  await writeEvent(mergeGroupEvent);
  await emitOutput(`${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  return Object.freeze({ status: 'PROTECTED_QUEUE_CONTEXT_READY', mergeGroupEvent: Object.freeze(mergeGroupEvent),
    outputs: Object.freeze(outputs), assurance: current.assurance });
}

async function main() {
  const event = readEvent(process.env.GITHUB_EVENT_PATH);
  const workspace = process.env.GITHUB_WORKSPACE;
  const currentRevision = protectedRuntimeRevision(workspace);
  const relay = expectedRelay(process.env.SELF_QUEUE_RELAY_WORKFLOW_ID, process.env.SELF_QUEUE_RELAY_WORKFLOW_PATH);
  const eventDir = resolveRunnerTempDirectory('owner-amendment-merge-group');
  const result = await prepareSelfQueueContext({ event, eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY, repositoryId: process.env.GITHUB_REPOSITORY_ID,
    workflowId: String(relay.workflowId), workflowPath: relay.workflowPath, runtimeRevision: currentRevision,
    token: process.env.GH_TOKEN,
    writeEvent: value => writeRunnerTempFile(eventDir, 'event.json', `${JSON.stringify(value)}\n`),
    emitOutput: value => appendGitHubOutput(value),
  });
  process.stdout.write(`Selected live queue context for protected main ${result.outputs.base_sha}, PR ${result.outputs.pr_number}, B ${result.outputs.b_sha}; no policy, evidence, eligibility, or acceptance claim.\n`);
}

if (import.meta.url.startsWith('file:') && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Protected queue context selection failed.'}\n`); process.exitCode = 1; });
}
