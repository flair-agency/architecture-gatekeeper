#!/usr/bin/env node
// @ts-check
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './ci-review/ci-report-entrypoint.mts';
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
  loadCodexReviewReport,
  main,
} from './ci-review/ci-report-entrypoint.mts';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
