#!/usr/bin/env node
// @ts-check
import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { appendGitHubOutput } from './runner-temp-path.mjs';
import { trustedGitHubOutputPath } from './github-runner-env.mjs';
import { MAX_ORDINARY_GEMINI_PROJECTION_BYTES } from './ordinary-gemini-ci-publication.mts';
import { fileURLToPath } from 'node:url';
import { assertSameMultiAuthorityProvenance } from './multi-authority-provenance.mjs';
import {
  COMMENT_MARKER,
  GITHUB_COM_API,
  cleanText,
  sanitizeReportApiContext,
  digestDecision,
  validateInlineFindings,
  formatInlineFindingHeading,
  postInlineReview,
  parseAuthorityProvenance,
  parseLegacyAuthorityProvenance,
  parseOwnerAdditionProcedure,
  classifyReview,
  renderReport,
  upsertPullRequestComment,
  loadCodexPassReport,
} from './ci-review/ci-report.mts';

// These erased views describe existing unchecked operations, not validation.
// Boxed JSON primitives and native failures retain their runtime behavior.
/** @typedef {({length?: unknown} & object) | (string & {length?: unknown}) | (number & {length?: unknown}) | (boolean & {length?: unknown}) | null | undefined} JsonLengthRead */
/** @typedef {{message?: unknown}} ErrorMessageRead */
/** @typedef {Iterable<{valid: unknown; index: number; reason: unknown}>} InlineFindingOperations */

export {
  COMMENT_MARKER,
  sanitizeReportApiContext,
  digestDecision,
  validateInlineFindings,
  formatInlineFindingHeading,
  postInlineReview,
  parseAuthorityProvenance,
  parseLegacyAuthorityProvenance,
  parseOwnerAdditionProcedure,
  classifyReview,
  renderReport,
  upsertPullRequestComment,
  loadCodexPassReport,
};

/** @returns {never} */
const reportFileFail = () => { throw new Error('Architecture Gate report filesystem boundary rejected its input.'); };

// GITHUB_OUTPUT remains the existing narrowly selected runner capability.
// Other environment paths are checked against its concrete per-step layout;
// this does not authenticate arbitrary environments or add a trusted accessor.
async function runnerReportPaths() {
  const output = trustedGitHubOutputPath();
  if (!isAbsolute(output) || resolve(output) !== output) reportFileFail();
  const match = /^set_output_([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.exec(basename(output));
  const commandDirectory = dirname(output);
  if (!match || basename(commandDirectory) !== '_runner_file_commands' ||
      await realpath(commandDirectory) !== commandDirectory) reportFileFail();
  const directoryInfo = await lstat(commandDirectory);
  const outputInfo = await lstat(output);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || !outputInfo.isFile() ||
      outputInfo.isSymbolicLink() || outputInfo.nlink !== 1) reportFileFail();
  const tempRoot = dirname(commandDirectory);
  if (await realpath(tempRoot) !== tempRoot) reportFileFail();
  return { tempRoot, summary: join(commandDirectory, `step_summary_${match[1]}`) };
}

/** @param {string} path
 * @param {number} flags */
async function openExistingReportFile(path, flags, { privateProjection = false } = {}) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
      privateProjection && ((before.mode & 0o777) !== 0o600 || before.size < 1 ||
        before.size > MAX_ORDINARY_GEMINI_PROJECTION_BYTES + 1)) reportFileFail();
  const handle = await open(path, flags | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino ||
        privateProjection && ((opened.mode & 0o777) !== 0o600 || opened.size !== before.size)) reportFileFail();
    return { handle, info: opened };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/** @param {NodeJS.ProcessEnv} env
 * @returns {Promise<NodeJS.ProcessEnv & {DECISION: string}>} */
async function readOrdinaryGeminiProjection(env) {
  const fail = () => { throw new Error('Masked ordinary Gemini report projection failed its protected binding checks.'); };
  if (env.REPORT_EXPECTED_PROVIDER !== 'gemini' || !/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID || '') ||
      !/^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT || '')) fail();
  const runId = Number(env.GITHUB_RUN_ID);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(attempt)) fail();
  const paths = await runnerReportPaths();
  if (env.RUNNER_TEMP !== paths.tempRoot) fail();
  const path = join(paths.tempRoot, `agk-ordinary-gemini-report-${runId}-${attempt}.json`);
  if (env.REPORT_PROJECTION_PATH !== path) fail();
  const { handle, info } = await openExistingReportFile(path, constants.O_RDONLY, { privateProjection: true });
  let bytes;
  try {
    // One extra byte detects growth without reading an unbounded replacement.
    const buffer = Buffer.alloc(info.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const part = await handle.read(buffer, size, buffer.length - size, size);
      if (part.bytesRead === 0) break;
      size += part.bytesRead;
    }
    const after = await handle.stat();
    if (size !== info.size || after.size !== info.size || after.nlink !== 1 || (after.mode & 0o777) !== 0o600) fail();
    bytes = buffer.subarray(0, size);
  } finally { await handle.close(); }
  let projection;
  try { projection = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(); }
  if (!projection || projection.version !== 1 || projection.kind !== 'display-only' || !projection.context || !projection.report) fail();
  const context = projection.context;
  const expected = {
    repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    eventSha: env.GITHUB_SHA, callerWorkflowSha: env.GITHUB_WORKFLOW_SHA,
    callerWorkflowRef: env.GITHUB_WORKFLOW_REF,
    workflowRepository: env.GATEKEEPER_WORKFLOW_REPOSITORY,
    workflowSha: env.GATEKEEPER_WORKFLOW_SHA, workflowRef: env.GATEKEEPER_WORKFLOW_REF,
    baseSha: env.BASE_SHA, headSha: env.HEAD_SHA, reviewedSha: env.REVIEWED_SHA,
    provider: env.REPORT_EXPECTED_PROVIDER, nonce: env.REPORT_EXPECTED_NONCE,
  };
  for (const [key, value] of Object.entries(expected)) if (context[key] !== value) fail();
  const report = projection.report;
  if (report.policyVersion !== env.POLICY_VERSION || report.mode !== env.MODE || report.policyResult !== env.POLICY_RESULT ||
      report.reviewResult !== env.REVIEW_RESULT || report.policyVersion !== '6' || report.mode !== 'enforced' ||
      report.policyResult !== 'success' || report.reviewResult !== 'success' || !report.decision ||
      !['PASS', 'BLOCK', 'OWNER_DECISION'].includes(report.decision.decision) ||
      report.validatedConclusion !== env.REPORT_EXPECTED_CONCLUSION || report.validatedDecisionDigest !== env.REPORT_EXPECTED_DECISION_DIGEST) fail();
  return {
    ...env,
    DECISION: JSON.stringify(report.decision),
    REVIEWED_SHA: context.reviewedSha,
    AUTHORITY_PROVENANCE_BASE64: Buffer.from(JSON.stringify(report.authorityProvenance), 'utf8').toString('base64'),
    LEGACY_AUTHORITY_PROVENANCE_BASE64: '',
    OWNER_ADDITION_SELECTED: 'false',
    OWNER_ADDITION_RESULT: 'skipped',
    OWNER_ADDITION_ELIGIBILITY: '',
    OWNER_ADDITION_PROCEDURE_BASE64: '',
  };
}

/** PR/report publication transport. Protected Codex display retrieval retains global Fetch.
 * @param {import("./ci-review/ci-report.mts").ReportFetch} [fetchImpl]
 * @returns {Promise<void>} */
export async function main(fetchImpl = fetch) {
  const suppliedEnv = process.env;
  if (suppliedEnv.REPORT_EXPECTED_PROVIDER === 'gemini' && !suppliedEnv.REPORT_PROJECTION_PATH) {
    throw new Error('Selected Gemini report has no masked publication projection.');
  }
  const env = suppliedEnv.REPORT_PROJECTION_PATH ? await readOrdinaryGeminiProjection(suppliedEnv) : suppliedEnv;
  const passReport = env.REPORT_PROJECTION_PATH ? null : await loadCodexPassReport(env);
  const reportDecision = passReport ? JSON.stringify(passReport.decision) : env.DECISION || '';
  let summaryHandle;
  if (env.GITHUB_STEP_SUMMARY) {
    const paths = await runnerReportPaths();
    if (env.GITHUB_STEP_SUMMARY !== paths.summary) reportFileFail();
    // Keep this exact descriptor across awaited API work; reopening by name
    // would permit a later parent-directory substitution.
    summaryHandle = (await openExistingReportFile(paths.summary, constants.O_WRONLY | constants.O_APPEND)).handle;
  }
  try {
    if (env.REPORT_PATH) {
      if (env.REPORT_PATH !== resolve('architecture-gate-report.md')) reportFileFail();
      try {
        await lstat('architecture-gate-report.md');
        reportFileFail();
      } catch (error) { if (/** @type {{code?: unknown}} */ (error).code !== 'ENOENT') throw error; }
    }
    const projectionSelected = Boolean(env.REPORT_PROJECTION_PATH);
    const projectedDecision = projectionSelected ? JSON.parse(/** @type {string} */ (env.DECISION)) : null;
    const ordinary = projectionSelected
      ? { conclusion: env.REPORT_EXPECTED_CONCLUSION, decision: projectedDecision }
      : classifyReview({ mode: env.MODE, policyResult: env.POLICY_RESULT,
        reviewResult: env.REVIEW_RESULT, rawDecision: reportDecision });
    const requiresAdditionProcedure = ordinary.conclusion === 'OWNER_DECISION' &&
      env.OWNER_ADDITION_SELECTED === 'true' && env.OWNER_ADDITION_RESULT === 'success' &&
      env.OWNER_ADDITION_ELIGIBILITY === 'ELIGIBLE';
    const ownerAdditionProcedure = requiresAdditionProcedure
      ? parseOwnerAdditionProcedure(env.OWNER_ADDITION_PROCEDURE_BASE64, true) : null;
    if (ownerAdditionProcedure && (ownerAdditionProcedure.repository !== env.GITHUB_REPOSITORY ||
        ownerAdditionProcedure.baseSha !== env.BASE_SHA ||
        ownerAdditionProcedure.headSha !== env.HEAD_SHA)) {
      throw new Error('G0 owner-addition procedure does not match this pull request.');
    }
    const authorityProvenance = parseAuthorityProvenance(env.AUTHORITY_PROVENANCE_BASE64,
      env.AUTHORITY_ROUTE_SELECTED === 'true' && env.REVIEW_RESULT === 'success' || Boolean(env.REPORT_PROJECTION_PATH));
    if (ownerAdditionProcedure?.version === 2) assertSameMultiAuthorityProvenance(authorityProvenance, ownerAdditionProcedure.authoritySet);
    const classified = projectionSelected
      ? { conclusion: /** @type {"PASS" | "BLOCK" | "OWNER_DECISION"} */ (env.REPORT_EXPECTED_CONCLUSION),
        summary: typeof projectedDecision.summary === 'string' && projectedDecision.summary.trim()
          ? projectedDecision.summary : 'No summary was supplied by the architecture reviewer.',
        decision: projectedDecision }
      : classifyReview({ mode: env.MODE, policyResult: env.POLICY_RESULT,
        reviewResult: env.REVIEW_RESULT, rawDecision: reportDecision,
        ownerAdditionSelected: env.OWNER_ADDITION_SELECTED === 'true', ownerAdditionResult: env.OWNER_ADDITION_RESULT,
        ownerAdditionEligibility: env.OWNER_ADDITION_ELIGIBILITY, ownerAdditionProcedure });
    if (env.REPORT_PROJECTION_PATH && (classified.conclusion !== env.REPORT_EXPECTED_CONCLUSION ||
        !classified.decision || classified.decision.decision !== env.REPORT_EXPECTED_CONCLUSION)) {
      throw new Error('Masked ordinary Gemini report projection disagrees with the protected conclusion.');
    }
    const legacyAuthorityProvenance = parseLegacyAuthorityProvenance(env.LEGACY_AUTHORITY_PROVENANCE_BASE64,
      env.POLICY_VERSION === '1' && env.REVIEW_RESULT === 'success');
    if (legacyAuthorityProvenance && (legacyAuthorityProvenance.baseSha !== env.BASE_SHA ||
        legacyAuthorityProvenance.headSha !== env.HEAD_SHA ||
        legacyAuthorityProvenance.reviewedSha !== env.REVIEWED_SHA)) {
      throw new Error('Legacy authority provenance does not match this pull request.');
    }
    let inlineDelivery = null;
    let reportApiContext = null;
    try {
      reportApiContext = sanitizeReportApiContext({
        apiUrl: env.GITHUB_API_URL || GITHUB_COM_API,
        repository: env.GITHUB_REPOSITORY,
        pullRequest: env.PR_NUMBER,
        expectedHead: env.HEAD_SHA,
      });
    } catch (error) {
      console.warn(`::warning title=Architecture Gate report API context rejected::${cleanText(/** @type {ErrorMessageRead} */ (error).message, 300)}`);
    }
    if (reportApiContext) {
      try {
        inlineDelivery = await postInlineReview({
          ...reportApiContext,
          fetchImpl,
          token: env.GITHUB_TOKEN,
          decision: classified.decision?.decision,
          findings: classified.decision?.findings,
        });
        for (const item of /** @type {InlineFindingOperations} */ (inlineDelivery.checked || [])) {
          if (!item.valid) console.warn(`::warning title=Architecture Gate inline finding deferred::Finding ${item.index + 1}: ${cleanText(item.reason, 300)}`);
        }
      } catch (error) {
        inlineDelivery = { status: 'unavailable', reason: cleanText(/** @type {ErrorMessageRead} */ (error).message, 500) };
        console.warn(`::warning title=Architecture Gate inline review unavailable::${inlineDelivery.reason}`);
      }
    } else if (classified.decision?.findings?.length) {
      inlineDelivery = { status: 'unavailable', reason: 'report API context failed validation' };
    }
    if (inlineDelivery?.status && inlineDelivery.status !== 'skipped') {
      console.log(`Architecture Gate inline review: ${inlineDelivery.status}${inlineDelivery.count ? ` (${inlineDelivery.count} finding(s))` : ''}${inlineDelivery.reason ? ` (${inlineDelivery.reason})` : ''}`);
    }
    if (inlineDelivery?.linkWarning) console.warn(`::warning title=Architecture Gate inline comment links unavailable::${cleanText(inlineDelivery.linkWarning, 500)}`);
    const decisionDigest = env.REPORT_PROJECTION_PATH ? env.REPORT_EXPECTED_DECISION_DIGEST : passReport?.decisionDigest || digestDecision(classified.decision);
    const report = renderReport(classified, {
      reviewedSha: env.REVIEWED_SHA,
      headSha: env.HEAD_SHA,
      runUrl: env.RUN_URL,
      workflowRef: env.WORKFLOW_REF,
      decisionDigest,
      authorityProvenance,
      legacyAuthorityProvenance,
      ownerAdditionProcedure,
      inlineDelivery,
    });
    if (summaryHandle) {
      const info = await summaryHandle.stat();
      if (!info.isFile() || info.nlink !== 1) reportFileFail();
      await summaryHandle.writeFile(report);
    }
    if (env.REPORT_PATH) {
      // Optional local copy has one fixed, exclusively created destination.
      const handle = await open('architecture-gate-report.md', constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(report); } finally { await handle.close(); }
    }
    try {
      if (!reportApiContext) throw new Error('Report API context failed validation.');
      const result = await upsertPullRequestComment({
        fetchImpl,
        apiUrl: reportApiContext.apiUrl,
        repository: reportApiContext.repository,
        pullRequest: reportApiContext.pullRequest,
        token: env.GITHUB_TOKEN,
        body: report,
      });
      console.log(`Architecture Gate PR comment: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    } catch (error) {
      if (env.REPORT_PROJECTION_PATH) throw new Error('Required Architecture Gate report publication failed.');
      console.warn(`::warning title=Architecture Gate comment unavailable::${cleanText(/** @type {ErrorMessageRead} */ (error).message, 500)}`);
    }
    if (env.REPORT_PROJECTION_PATH && (classified.conclusion !== env.REPORT_EXPECTED_CONCLUSION || decisionDigest !== env.REPORT_EXPECTED_DECISION_DIGEST)) {
      throw new Error('Masked ordinary Gemini projection does not match the protected semantic outcome.');
    }
    if (env.GITHUB_OUTPUT) {
      appendGitHubOutput(`conclusion=${classified.conclusion}\ndecision_digest=${decisionDigest}\n`);
    }
  } finally { if (summaryHandle) await summaryHandle.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
