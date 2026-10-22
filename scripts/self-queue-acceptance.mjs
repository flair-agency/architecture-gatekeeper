#!/usr/bin/env node
// Protected Queue receiver preflight. It selects context only; existing validators own review and route acceptance.
import { execFileSync } from 'node:child_process';
import { openSync, closeSync, fstatSync, readFileSync, constants } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendGitHubOutput, resolveRunnerTempDirectory, writeRunnerTempFile } from '../dist/runner-temp-path.mjs';
import { prepareSelfQueueContext } from './self-queue-context.mjs';

const MAX_EVENT_BYTES = 262_144;
const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = 'flair-agency/architecture-gatekeeper';
const REPOSITORY_ID = '1379218762';
const WORKFLOW_REF = 'flair-agency/architecture-gatekeeper/.github/workflows/self-queue-acceptance.yml@refs/heads/main';
const fail = message => { throw new Error(`Self queue acceptance preflight: ${message}`); };

function readEvent(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) fail('workflow_run event path is unavailable.');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > MAX_EVENT_BYTES) fail('workflow_run event is not a bounded regular file.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(fd)));
  } finally { if (fd !== undefined) closeSync(fd); }
}

function checkedOutHead(workspace, runGit) {
  if (typeof workspace !== 'string' || !isAbsolute(workspace) || resolve(workspace) !== workspace) fail('protected workspace is unavailable.');
  const sha = runGit(workspace, 'rev-parse', 'HEAD');
  if (typeof sha !== 'string' || !SHA.test(sha.trim())) fail('protected runtime HEAD is malformed.');
  return sha.trim();
}

/** Run the protected preflight again at each Queue boundary and emit exact fresh context outputs. */
export async function runSelfQueueAcceptance({ args = [], env = process.env, event, runGit = (workspace, ...args) =>
  execFileSync('git', args, { cwd: workspace, encoding: 'utf8', timeout: 10_000, maxBuffer: 4096 }),
  fetchImpl = fetch, resolveContext, writeEvent, emitOutput } = {}) {
  if (!Array.isArray(args) || args.length !== 1 || args[0] !== 'preflight') fail('expected preflight.');
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REPOSITORY_ID !== REPOSITORY_ID ||
      env.GITHUB_WORKFLOW_REF !== WORKFLOW_REF || !SHA.test(env.GITHUB_WORKFLOW_SHA ?? '')) {
    fail('protected receiver identity or workflow revision is invalid.');
  }
  const head = checkedOutHead(env.GITHUB_WORKSPACE, runGit);
  if (head !== env.GITHUB_WORKFLOW_SHA) fail('checked-out protected runtime differs from the receiver workflow revision.');
  if (typeof writeEvent !== 'function' || typeof emitOutput !== 'function') fail('protected runner output operations are unavailable.');
  let selectedEvent;
  let selectedOutput;
  const result = await prepareSelfQueueContext({
    event, eventName: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY,
    repositoryId: env.GITHUB_REPOSITORY_ID,
    workflowId: env.SELF_QUEUE_RELAY_WORKFLOW_ID, workflowPath: env.SELF_QUEUE_RELAY_WORKFLOW_PATH,
    runtimeRevision: head, token: env.GH_TOKEN, fetchImpl,
    ...(resolveContext ? { resolveContext } : {}),
    writeEvent: async value => { selectedEvent = value; },
    emitOutput: async value => { selectedOutput = value; },
  });
  if (result.status !== 'PROTECTED_QUEUE_CONTEXT_READY') fail('current protected Queue context is incomplete.');
  const expected = [
    ['SELF_QUEUE_EXPECTED_GROUP_SHA', result.outputs.group_sha],
    ['SELF_QUEUE_EXPECTED_BASE_SHA', result.outputs.base_sha],
    ['SELF_QUEUE_EXPECTED_B_SHA', result.outputs.b_sha],
    ['SELF_QUEUE_EXPECTED_PR_NUMBER', result.outputs.pr_number],
  ];
  for (const [key, actual] of expected) {
    if (env[key] !== undefined && env[key] !== actual) fail(`current Queue context differs from the earlier protected ${key} selection.`);
  }
  if (!selectedEvent || typeof selectedOutput !== 'string') fail('selected protected Queue outputs are unavailable.');
  await writeEvent(selectedEvent);
  await emitOutput(selectedOutput);
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const event = readEvent(process.env.GITHUB_EVENT_PATH);
  const eventDir = resolveRunnerTempDirectory('owner-amendment-merge-group');
  const result = await runSelfQueueAcceptance({ args: argv, env: process.env, event,
    writeEvent: value => writeRunnerTempFile(eventDir, 'event.json', `${JSON.stringify(value)}\n`),
    emitOutput: value => appendGitHubOutput(value),
  });
  process.stdout.write(`Protected current Queue context selected for ${result.outputs.base_sha}/${result.outputs.group_sha}, PR ${result.outputs.pr_number}, B ${result.outputs.b_sha}; no review, evidence, or acceptance claim.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Protected Queue preflight failed.'}\n`); process.exitCode = 1; });
}
