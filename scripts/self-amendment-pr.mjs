#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { readDescriptorBytes } from '../src/io/read-descriptor.mts';
import { rejectDuplicateJsonKeys } from '../src/authority-set.mts';
import { selectSelfPrContext } from '../src/self-pr-context.mts';
import { prepareSelfAmendmentPr, validateSelfAmendmentPrDecision } from '../src/self-amendment-pr.mts';
import { resolveRunnerTempDirectory, writeRunnerTempFile, appendGitHubOutput } from '../src/runner-temp-path.mts';
const fail = message => { throw new Error(`Self amendment CLI: ${message}`); };
const env = process.env;
async function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['prepare', 'complete', 'verify'].includes(mode)) fail('expected prepare, complete or verify.');
  const repository = 'flair-agency/architecture-gatekeeper';
  if (env.POLICY_PATH !== '.codex/gatekeeper/ci-policy.json' || !/^[a-f0-9]{64}$/.test(env.POLICY_SHA256 ?? '')) fail('protected self Policy selection required.');
  if (env.GITHUB_REPOSITORY !== repository || (env.REPOSITORY && env.REPOSITORY !== repository) ||
      env.GITHUB_REPOSITORY_ID !== '1379218762' || env.GITHUB_EVENT_NAME !== 'pull_request_target' ||
      env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/self-architecture-gate.yml@refs/heads/main` ||
      env.GITHUB_WORKFLOW_SHA !== env.BASE_SHA || env.GITHUB_SHA !== env.BASE_SHA ||
      env.GATEKEEPER_WORKFLOW_REPOSITORY !== repository ||
      env.GATEKEEPER_WORKFLOW_REF !== `${repository}/.github/workflows/architecture-gate.yml@refs/heads/main` ||
      env.GATEKEEPER_WORKFLOW_SHA !== env.BASE_SHA || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '') || !env.GITHUB_JOB) fail('protected self caller metadata mismatch.');
  const eventBytes = readDescriptorBytes(0, Buffer.alloc(1_048_577));
  if (!eventBytes.length || eventBytes.length > 1_048_576) fail('event missing or oversized.');
  const eventSource = new TextDecoder('utf-8', { fatal: true }).decode(eventBytes);
  rejectDuplicateJsonKeys(eventSource, 'protected event', { maxDepth: 64 });
  const event = JSON.parse(eventSource);
  const pr = event.pull_request;
  if (event.repository?.full_name !== repository || String(event.repository?.id) !== env.GITHUB_REPOSITORY_ID ||
      !Number.isSafeInteger(event.number) || event.number < 1 || pr?.number !== event.number ||
      pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository || pr.base?.ref !== 'main' ||
      pr.base.sha !== env.BASE_SHA || pr.head.sha !== env.HEAD_SHA) fail('event PR tuple mismatch.');
  const purpose = `${pr.title ?? ''}\n\n${pr.body ?? ''}`;
  if (env.PURPOSE !== undefined && env.PURPOSE !== purpose) fail('purpose differs from event proposal.');
  const prepared = await prepareSelfAmendmentPr({ repository, cwd: fileURLToPath(new URL('../', import.meta.url)), baseSha: env.BASE_SHA,
    headSha: env.HEAD_SHA, reviewedSha: env.REVIEWED_SHA, baseBranch: env.BASE_BRANCH ?? 'main',
    policyPath: env.POLICY_PATH, policySha256: env.POLICY_SHA256, purpose });
  if (mode === 'prepare') {
    const directory = resolveRunnerTempDirectory('self-amendment-pr');
    writeRunnerTempFile(directory, 'prompt.md', prepared.promptBytes);
    writeRunnerTempFile(directory, 'schema.json', prepared.schemaBytes);
    appendGitHubOutput(`context_sha256=${prepared.contextSha256}\n`);
    return;
  }
  let decisionBytes;
  if (mode === 'verify') {
    if (env.CONTEXT_SHA256 !== prepared.contextSha256 || typeof env.DECISION_BASE64 !== 'string' ||
        env.DECISION_BASE64.length > 90_000) fail('same-run context mismatch.');
    decisionBytes = Buffer.from(env.DECISION_BASE64, 'base64');
    if (decisionBytes.toString('base64') !== env.DECISION_BASE64) fail('noncanonical decision Base64.');
  } else decisionBytes = Buffer.from(env.DECISION ?? '');
  const result = validateSelfAmendmentPrDecision({ prepared, decisionBytes });
  if (mode === 'verify') {
    if (result.eligibility !== 'ELIGIBLE') fail('amendment is ineligible.');
    if (!env.GH_TOKEN) fail('GH_TOKEN is required for final live PR validation.');
    const live = await selectSelfPrContext({ eventName: env.GITHUB_EVENT_NAME, event,
      sourceBaseSha: env.BASE_SHA, runtimeBaseSha: env.BASE_SHA, token: env.GH_TOKEN });
    if (live.status !== 'SELECTED_SELF_PR_CONTEXT') fail('final live PR context is incomplete.');
    if (live.repository !== prepared.repository || live.prNumber !== String(event.number) ||
        live.baseSha !== prepared.baseSha || live.headSha !== prepared.headSha ||
        live.subjectSha !== prepared.reviewedSha) fail('final main/PR/test-merge tuple differs from reviewed amendment.');
  } else appendGitHubOutput(`eligibility=${result.eligibility}\ncontext_sha256=${prepared.contextSha256}\ndecision_base64=${result.decisionBase64}\n`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
