#!/usr/bin/env node
// @ts-check
import { appendFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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

/** @returns {Promise<void>} */
async function main() {
  const passReport = await loadCodexPassReport(process.env);
  const reportDecision = passReport ? JSON.stringify(passReport.decision) : process.env.DECISION || '';
  const ordinary = classifyReview({
    mode: process.env.MODE, policyResult: process.env.POLICY_RESULT,
    reviewResult: process.env.REVIEW_RESULT, rawDecision: reportDecision,
  });
  const requiresAdditionProcedure = ordinary.conclusion === 'OWNER_DECISION' &&
    process.env.OWNER_ADDITION_SELECTED === 'true' && process.env.OWNER_ADDITION_RESULT === 'success' &&
    process.env.OWNER_ADDITION_ELIGIBILITY === 'ELIGIBLE';
  const ownerAdditionProcedure = requiresAdditionProcedure
    ? parseOwnerAdditionProcedure(process.env.OWNER_ADDITION_PROCEDURE_BASE64, true) : null;
  if (ownerAdditionProcedure && (ownerAdditionProcedure.repository !== process.env.GITHUB_REPOSITORY ||
      ownerAdditionProcedure.baseSha !== process.env.BASE_SHA ||
      ownerAdditionProcedure.headSha !== process.env.HEAD_SHA)) {
    throw new Error('G0 owner-addition procedure does not match this pull request.');
  }
  const authorityProvenance = parseAuthorityProvenance(process.env.AUTHORITY_PROVENANCE_BASE64,
    process.env.AUTHORITY_ROUTE_SELECTED === 'true' && process.env.REVIEW_RESULT === 'success');
  if (ownerAdditionProcedure?.version === 2) assertSameMultiAuthorityProvenance(authorityProvenance, ownerAdditionProcedure.authoritySet);
  /** @type {ReturnType<typeof classifyReview> & {decision: (Record<string, unknown> & {findings?: JsonLengthRead}) | null}} */
  const classified = classifyReview({
    mode: process.env.MODE,
    policyResult: process.env.POLICY_RESULT,
    reviewResult: process.env.REVIEW_RESULT,
    rawDecision: reportDecision,
    ownerAdditionSelected: process.env.OWNER_ADDITION_SELECTED === 'true',
    ownerAdditionResult: process.env.OWNER_ADDITION_RESULT,
    ownerAdditionEligibility: process.env.OWNER_ADDITION_ELIGIBILITY,
    ownerAdditionProcedure,
  });
  const legacyAuthorityProvenance = parseLegacyAuthorityProvenance(process.env.LEGACY_AUTHORITY_PROVENANCE_BASE64,
    process.env.POLICY_VERSION === '1' && process.env.REVIEW_RESULT === 'success');
  if (legacyAuthorityProvenance && (legacyAuthorityProvenance.baseSha !== process.env.BASE_SHA ||
      legacyAuthorityProvenance.headSha !== process.env.HEAD_SHA ||
      legacyAuthorityProvenance.reviewedSha !== process.env.REVIEWED_SHA)) {
    throw new Error('Legacy authority provenance does not match this pull request.');
  }
  let inlineDelivery = null;
  let reportApiContext = null;
  try {
    reportApiContext = sanitizeReportApiContext({
      apiUrl: process.env.GITHUB_API_URL || GITHUB_COM_API,
      repository: process.env.GITHUB_REPOSITORY,
      pullRequest: process.env.PR_NUMBER,
      expectedHead: process.env.HEAD_SHA,
    });
  } catch (error) {
    console.warn(`::warning title=Architecture Gate report API context rejected::${cleanText(/** @type {ErrorMessageRead} */ (error).message, 300)}`);
  }
  if (reportApiContext) {
    try {
      inlineDelivery = await postInlineReview({
        ...reportApiContext,
        token: process.env.GITHUB_TOKEN,
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
  const report = renderReport(classified, {
    reviewedSha: process.env.REVIEWED_SHA,
    headSha: process.env.HEAD_SHA,
    runUrl: process.env.RUN_URL,
    workflowRef: process.env.WORKFLOW_REF,
    authorityProvenance,
    legacyAuthorityProvenance,
    ownerAdditionProcedure,
    inlineDelivery,
    decisionDigest: passReport?.decisionDigest,
  });
  const decisionDigest = passReport?.decisionDigest || digestDecision(classified.decision);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  if (process.env.REPORT_PATH) await writeFile(process.env.REPORT_PATH, report);
  try {
    if (!reportApiContext) throw new Error('Report API context failed validation.');
    const result = await upsertPullRequestComment({
      apiUrl: reportApiContext.apiUrl,
      repository: reportApiContext.repository,
      pullRequest: reportApiContext.pullRequest,
      token: process.env.GITHUB_TOKEN,
      body: report,
    });
    console.log(`Architecture Gate PR comment: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  } catch (error) {
    console.warn(`::warning title=Architecture Gate comment unavailable::${cleanText(/** @type {ErrorMessageRead} */ (error).message, 500)}`);
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `conclusion=${classified.conclusion}\ndecision_digest=${decisionDigest}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
