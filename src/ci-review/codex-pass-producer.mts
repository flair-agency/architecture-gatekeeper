import { constants, openSync, closeSync, fstatSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from '../authority-set.mts';
import { validateJsonSchema } from '../json-schema.mts';
import { validateDecisionRules } from '../validate-decision.mts';
import { validatePreparedAuthorityDecision } from '../validate-authority-set-decision.mts';
import { validateLegacyAuthorityDecision } from '../prepare-legacy-ci-authority.mts';
import { classifyReview, digestDecision, parseAuthorityProvenance, parseLegacyAuthorityProvenance } from '../ci-report.mts';
import { appendGitHubOutput } from '../runner-temp-path.mts';
import { readDescriptorBytes } from '../io/read-descriptor.mts';
import { contextOf, requireSelfPassContext, createPassDisplay, emitPassDisplay, fail, type PassContext } from './codex-pass-publication.mts';

/** Fixed job-local inputs; no destination or filename comes from reviewer output. */
export function readCodexInput(name: 'decision'|'schema'|'rules'|'authority'|'legacy'): string {
  const files = { decision:'architecture-gate-codex-final.json',schema:'architecture-gate-decision.schema.json',
    rules:'architecture-gate-decision.validation.json',authority:'architecture-gate-authority-set/authority-provenance.json',
    legacy:'architecture-gate-legacy-provenance.json' };
  if (!Object.hasOwn(files,name) || process.cwd() !== process.env.RUNNER_TEMP || realpathSync(process.cwd()) !== process.cwd()) fail();
  const path = resolve(process.cwd(),files[name]);
  if (realpathSync(path) !== path) fail();
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) fail();
  const fd = openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd); const limit = name === 'decision' ? 65_536 : 1_048_576;
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.dev || stat.ino !== before.ino || stat.size < 1 || stat.size > limit) fail();
    const bytes = readDescriptorBytes(fd, Buffer.alloc(limit + 1));
    if (bytes.length !== stat.size || bytes.length > limit) fail();
    return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  } finally { closeSync(fd); }
}
function json(text: string, label: string, depth = 256): unknown {
  rejectDuplicateJsonKeys(text,label,{maxDepth:depth}); return JSON.parse(text);
}
export function validateCodexPass(input: {
  context: PassContext; decisionText: string; schemaText: string; rulesText: string | null;
  authorityText: string | null; legacyText: string | null; authorityEncoded: string; legacyEncoded: string;
  policyVersion: string; mode: string; policyResult: string; reviewResult: string;
}) {
  contextOf(input.context);
  if (input.mode !== 'enforced' || input.policyResult !== 'success' || input.reviewResult !== 'success') fail();
  if (Buffer.byteLength(input.decisionText) < 1 || Buffer.byteLength(input.decisionText) > 65_536 ||
      Buffer.byteLength(input.schemaText) > 1_048_576) fail();
  const decision = json(input.decisionText,'Codex decision');
  validateJsonSchema(decision,json(input.schemaText,'Codex schema',514));
  if (input.rulesText !== null) validateDecisionRules(decision,json(input.rulesText,'consumer rules') as Record<string,unknown>);
  if (input.authorityText !== null) {
    const provenance = parseAuthorityProvenance(input.authorityEncoded,true);
    const file = json(input.authorityText,'authority provenance');
    if (JSON.stringify(file) !== JSON.stringify(provenance)) fail();
    validatePreparedAuthorityDecision(decision,provenance);
  }
  if (input.policyVersion === '1') {
    if (input.legacyText === null) fail();
    const provenance = parseLegacyAuthorityProvenance(input.legacyEncoded,true);
    if (JSON.stringify(json(input.legacyText,'legacy provenance')) !== JSON.stringify(provenance) ||
        provenance.baseSha !== input.context.baseSha || provenance.headSha !== input.context.headSha ||
        provenance.reviewedSha !== input.context.reviewedSha) fail();
    validateLegacyAuthorityDecision(input.decisionText,provenance);
  }
  const classified = classifyReview({mode:input.mode,policyResult:input.policyResult,reviewResult:input.reviewResult,rawDecision:input.decisionText});
  // Non-PASS routes continue using their ORIGINAL raw cross-job inputs.
  if (classified.conclusion !== 'PASS') return null;
  return createPassDisplay(input.context,decision,digestDecision(classified.decision));
}
function main(): void {
  const env = process.env;
  if (!['true','false'].includes(env.VALIDATION_SELECTED || '') || !['true','false'].includes(env.AUTHORITY_ROUTE_SELECTED || '')) fail();
  if (env.GITHUB_EVENT_NAME !== 'pull_request_target' || env.BASE_BRANCH !== 'main' || env.PROTECTED_INSTRUCTIONS !== 'true') fail();
  const context = contextOf({repository:env.GITHUB_REPOSITORY,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
    eventSha:env.GITHUB_SHA,callerWorkflowSha:env.GITHUB_WORKFLOW_SHA,callerWorkflowRef:env.GITHUB_WORKFLOW_REF,
    workflowRepository:env.GATEKEEPER_WORKFLOW_REPOSITORY,workflowSha:env.GATEKEEPER_WORKFLOW_SHA,workflowRef:env.GATEKEEPER_WORKFLOW_REF,
    baseSha:env.BASE_SHA,headSha:env.HEAD_SHA,reviewedSha:env.REVIEWED_SHA});
  requireSelfPassContext(context);
  const result = validateCodexPass({context,decisionText:readCodexInput('decision'),schemaText:readCodexInput('schema'),
    rulesText:env.VALIDATION_SELECTED === 'true' ? readCodexInput('rules') : null,
    authorityText:env.AUTHORITY_ROUTE_SELECTED === 'true' ? readCodexInput('authority') : null,
    legacyText:env.POLICY_VERSION === '1' ? readCodexInput('legacy') : null,
    authorityEncoded:env.AUTHORITY_PROVENANCE_BASE64 || '',legacyEncoded:env.LEGACY_AUTHORITY_PROVENANCE_BASE64 || '',
    policyVersion:env.POLICY_VERSION || '',mode:env.MODE || '',policyResult:env.POLICY_RESULT || '',reviewResult:env.REVIEW_RESULT || ''});
  if (!result) return;
  emitPassDisplay(result.projection);
  appendGitHubOutput(`pass_conclusion=PASS\npass_digest=${result.expected.decisionDigest}\npass_nonce=${result.expected.nonce}\n`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
